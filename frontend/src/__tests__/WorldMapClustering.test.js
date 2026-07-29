import {
    buildGridClusters,
    buildProximityClusters
} from '../utils/WorldMapClustering';

const photo = (id, lat, lng) => ({ id, lat, lng });

describe('WorldMap clustering', () => {
    test('merges nearby locations even when a grid border separates them', () => {
        const paris = photo('paris', 48.85468, 2.347648);
        const versailles = photo('versailles', 48.804564, 2.120927);

        expect(buildGridClusters([paris, versailles], 0.32)).toHaveLength(2);

        const clusters = buildProximityClusters([paris, versailles], 0.32);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].photos).toEqual([paris, versailles]);
    });

    test('keeps locations beyond the closest-level radius separate', () => {
        const milan = photo('milan', 45.464448, 9.187302);
        const bergamo = photo('bergamo', 45.664746, 9.701672);

        expect(buildProximityClusters([milan, bergamo], 0.32)).toHaveLength(2);
    });

    test('computes a valid spherical center across the date line', () => {
        const clusters = buildProximityClusters([
            photo('west', 0, 179.95),
            photo('east', 0, -179.95)
        ], 0.32);

        expect(clusters).toHaveLength(1);
        expect(Math.abs(clusters[0].center[1])).toBeGreaterThan(179);
    });
});
