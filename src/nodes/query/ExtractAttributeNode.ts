import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebQueryCategory } from '../../category';
import * as cheerio from 'cheerio';

const EMPTY_OUTPUTS = { 'First Value': '', 'All Values': [] as string[], 'Count': 0 };

export class ExtractAttributeNode extends BaseNode {
    readonly typeId = 'web.extract-attribute';
    readonly displayName = 'Extract Attribute';
    readonly category = WebQueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' },
        { name: 'Selector', acceptsType: 'core:string' },
        { name: 'Attribute', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'First Value', outputType: 'core:string' },
        { name: 'All Values', outputType: 'core:string-array' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'selector', label: 'Selector', type: 'string', defaultValue: 'a' },
        { name: 'attribute', label: 'Attribute', type: 'string', defaultValue: 'href' },
        { name: 'excludeEmpty', label: 'Exclude Empty', type: 'boolean', defaultValue: true }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        const selector = (inputs['Selector'] != null ? String(inputs['Selector']) : '') || String(properties['selector'] || 'a');
        const attr = (inputs['Attribute'] != null ? String(inputs['Attribute']) : '') || String(properties['attribute'] || 'href');
        const excludeEmpty = properties['excludeEmpty'] !== false;

        try {
            const $ = cheerio.load(html);
            const matched = $(selector);
            const count = matched.length;

            const rawValues = matched.map((_, el) => $(el).attr(attr) ?? null).get() as (string | null)[];
            const allValues = excludeEmpty
                ? rawValues.filter((v): v is string => v !== null && v !== '')
                : rawValues.filter((v): v is string => v !== null);

            const firstValue = (excludeEmpty ? allValues[0] : rawValues.find(v => v !== null)) ?? '';

            return { 'First Value': firstValue, 'All Values': allValues, 'Count': count };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
