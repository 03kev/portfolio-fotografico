async function readStreamToBuffer(stream, { maxBytes = null } = {}) {
    const chunks = [];
    const normalizedMaxBytes = Number.isSafeInteger(Number(maxBytes))
        && Number(maxBytes) > 0
        ? Number(maxBytes)
        : null;
    let totalBytes = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (normalizedMaxBytes !== null && totalBytes > normalizedMaxBytes) {
            const error = new RangeError('Lo stream supera la dimensione massima consentita.');
            error.code = 'STREAM_MAX_BYTES_EXCEEDED';
            error.maxBytes = normalizedMaxBytes;
            error.actualBytes = totalBytes;
            if (typeof stream.destroy === 'function') stream.destroy();
            throw error;
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks, totalBytes);
}

module.exports = {
    readStreamToBuffer
};
