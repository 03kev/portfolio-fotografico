const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
    let Pool;
    try {
        ({ Pool } = require('pg'));
    } catch {
        throw new Error('Dipendenza "pg" mancante. Esegui npm install nel backend.');
    }

    const databaseUrl = String(
        process.env.DATABASE_DIRECT_URL
        || process.env.DATABASE_URL
        || ''
    ).trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_DIRECT_URL o DATABASE_URL non impostata.');
    }

    const migrationsDirectory = path.resolve(__dirname, '../db/migrations');
    const filenames = (await fs.readdir(migrationsDirectory))
        .filter((filename) => /^\d+.*\.sql$/.test(filename))
        .sort();
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });

    try {
        for (const filename of filenames) {
            const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
            const checksum = crypto.createHash('sha256').update(sql).digest('hex');
            const exists = await pool.query(
                `SELECT checksum
                 FROM portfolio_schema_migrations
                 WHERE name = $1`,
                [filename]
            ).catch((error) => {
                if (error.code === '42P01') return { rows: [] };
                throw error;
            });

            if (exists.rows[0]) {
                if (exists.rows[0].checksum !== checksum) {
                    throw new Error(`Checksum migration cambiato: ${filename}`);
                }
                console.log(`[migration] già applicata: ${filename}`);
                continue;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    `INSERT INTO portfolio_schema_migrations (name, checksum)
                     VALUES ($1, $2)
                     ON CONFLICT (name) DO NOTHING`,
                    [filename, checksum]
                );
                await client.query('COMMIT');
                console.log(`[migration] applicata: ${filename}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('[migration] errore:', error.message);
    process.exitCode = 1;
});
