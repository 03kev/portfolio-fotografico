const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const toUnitVector = (photo) => {
    const latitude = photo.lat * DEG_TO_RAD;
    const longitude = photo.lng * DEG_TO_RAD;
    const cosLatitude = Math.cos(latitude);
    return [
        cosLatitude * Math.cos(longitude),
        Math.sin(latitude),
        cosLatitude * Math.sin(longitude)
    ];
};

const centerOfPhotos = (photos) => {
    const sum = photos.reduce((result, photo) => {
        const point = toUnitVector(photo);
        result[0] += point[0];
        result[1] += point[1];
        result[2] += point[2];
        return result;
    }, [0, 0, 0]);

    const longitude = Math.atan2(sum[2], sum[0]);
    const latitude = Math.atan2(
        sum[1],
        Math.hypot(sum[0], sum[2])
    );
    return [latitude * RAD_TO_DEG, longitude * RAD_TO_DEG];
};

const angularDistanceDegrees = (first, second) => {
    const firstPoint = toUnitVector(first);
    const secondPoint = toUnitVector(second);
    const cosine = (
        firstPoint[0] * secondPoint[0]
        + firstPoint[1] * secondPoint[1]
        + firstPoint[2] * secondPoint[2]
    );
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * RAD_TO_DEG;
};

export const buildGridClusters = (photos, stepDegrees) => {
    const cells = new Map();

    photos.forEach((photo) => {
        const key = [
            Math.floor(photo.lat / stepDegrees),
            Math.floor(photo.lng / stepDegrees)
        ].join('_');
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(photo);
    });

    return Array.from(cells.values()).map((clusterPhotos) => ({
        center: centerOfPhotos(clusterPhotos),
        photos: clusterPhotos
    }));
};

/**
 * Clusters nearby locations independently of latitude/longitude grid borders.
 * Connected locations are intentional: at the closest zoom level the cluster
 * represents one geographic area whose individual markers would overlap.
 */
export const buildProximityClusters = (photos, maxDistanceDegrees) => {
    const parents = photos.map((_, index) => index);

    const find = (index) => {
        let root = index;
        while (parents[root] !== root) root = parents[root];
        while (parents[index] !== index) {
            const next = parents[index];
            parents[index] = root;
            index = next;
        }
        return root;
    };

    const union = (first, second) => {
        const firstRoot = find(first);
        const secondRoot = find(second);
        if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
    };

    for (let first = 0; first < photos.length; first += 1) {
        for (let second = first + 1; second < photos.length; second += 1) {
            if (
                angularDistanceDegrees(photos[first], photos[second])
                <= maxDistanceDegrees
            ) {
                union(first, second);
            }
        }
    }

    const groups = new Map();
    photos.forEach((photo, index) => {
        const root = find(index);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(photo);
    });

    return Array.from(groups.values()).map((clusterPhotos) => ({
        center: centerOfPhotos(clusterPhotos),
        photos: clusterPhotos
    }));
};
