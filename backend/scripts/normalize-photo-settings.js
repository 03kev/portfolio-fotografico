#!/usr/bin/env node
/**
 * Script di manutenzione: normalizza il campo `settings` in photos.json.
 *
 * Obiettivo:
 * - Convertire `settings` da stringa JSON a oggetto
 * - Forzare un oggetto vuoto `{}` quando il valore è invalido/non oggetto
 *
 * Opzioni:
 * - --dry-run: mostra i conteggi senza scrivere su photos.json
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');

function normalizeSettingsValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { normalized: value, changed: false, reason: 'already_object' };
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { normalized: parsed, changed: true, reason: 'parsed_string' };
            }
            return { normalized: {}, changed: true, reason: 'parsed_non_object' };
        } catch {
            return { normalized: {}, changed: true, reason: 'invalid_json_string' };
        }
    }

    return { normalized: {}, changed: true, reason: 'non_object_value' };
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const photos = await readMetadataFile('photos.json', []);

    let changed = 0;
    let parsedString = 0;
    let invalidJson = 0;
    let nonObjectParsed = 0;
    let nonObjectValue = 0;
    let unchanged = 0;

    for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i];
        const result = normalizeSettingsValue(photo.settings);

        if (!result.changed) {
            unchanged += 1;
            continue;
        }

        if (result.reason === 'parsed_string') parsedString += 1;
        if (result.reason === 'invalid_json_string') invalidJson += 1;
        if (result.reason === 'parsed_non_object') nonObjectParsed += 1;
        if (result.reason === 'non_object_value') nonObjectValue += 1;

        photos[i] = {
            ...photo,
            settings: result.normalized
        };
        changed += 1;
    }

    if (!dryRun && changed > 0) {
        await writeMetadataFile('photos.json', photos);
    }

    console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Photos total: ${photos.length}`);
    console.log(`Settings unchanged (already object): ${unchanged}`);
    console.log(`Settings changed: ${changed}`);
    console.log(`- parsed JSON string -> object: ${parsedString}`);
    console.log(`- invalid JSON string -> {}: ${invalidJson}`);
    console.log(`- JSON string non-object -> {}: ${nonObjectParsed}`);
    console.log(`- non-object value -> {}: ${nonObjectValue}`);
}

main().catch((error) => {
    console.error('Errore durante la normalizzazione settings:', error);
    process.exit(1);
});

