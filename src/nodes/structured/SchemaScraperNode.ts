import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebStructuredCategory } from '../../category';
import * as cheerio from 'cheerio';
import * as aq from 'arquero';

interface SchemaEntry {
    field: string;
    selector: string;
    attribute: string | null;
}

function parseSchema(raw: string): SchemaEntry[] {
    const entries: SchemaEntry[] = [];
    for (const line of raw.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx < 1) continue;
        const field = line.slice(0, colonIdx).trim();
        const rest = line.slice(colonIdx + 1).trim();
        if (!field || !rest) continue;

        const atIdx = rest.indexOf('@');
        if (atIdx !== -1) {
            entries.push({ field, selector: rest.slice(0, atIdx).trim(), attribute: rest.slice(atIdx + 1).trim() });
        } else {
            entries.push({ field, selector: rest, attribute: null });
        }
    }
    return entries;
}

const EMPTY_OUTPUTS = { 'Records': { __arqueroData: [] }, 'Count': 0 };

export class SchemaScraperNode extends BaseNode {
    readonly typeId = 'web.schema-scraper';
    readonly displayName = 'Schema Scraper';
    readonly category = WebStructuredCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Records', outputType: 'core:dataframe' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'containerSelector', label: 'Container Selector', type: 'string', defaultValue: '.item' },
        {
            name: 'schema',
            label: 'Schema',
            description: 'One field per line: fieldName: selector or fieldName: selector@attribute. Use "." to target the container itself.',
            type: 'text',
            defaultValue: 'title: .title\nurl: a@href'
        }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        const containerSelector = String(properties['containerSelector'] || '.item');
        const schemaRaw = String(properties['schema'] || '');

        let schemaEntries: SchemaEntry[];
        try {
            schemaEntries = parseSchema(schemaRaw);
        } catch {
            return EMPTY_OUTPUTS;
        }

        if (schemaEntries.length === 0) return EMPTY_OUTPUTS;

        try {
            const $ = cheerio.load(html);
            const rows: Record<string, string>[] = [];

            $(containerSelector).each((_, containerEl) => {
                const record: Record<string, string> = {};
                for (const entry of schemaEntries) {
                    const isSelf = entry.selector === '.' || entry.selector === '';
                    const target = isSelf ? $(containerEl) : $(containerEl).find(entry.selector).first();
                    if (entry.attribute) {
                        record[entry.field] = target.attr(entry.attribute) ?? '';
                    } else {
                        record[entry.field] = target.text().trim();
                    }
                }
                rows.push(record);
            });

            return {
                'Records': { __arqueroData: aq.from(rows).objects() },
                'Count': rows.length
            };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
