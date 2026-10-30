import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebQueryCategory } from '../../category';
import * as cheerio from 'cheerio';

function normalizeText(text: string, trim: boolean, collapse: boolean): string {
    let t = text;
    if (collapse) t = t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
    if (trim) t = t.trim();
    return t;
}

const EMPTY_OUTPUTS = {
    'First Text': '',
    'First HTML': '',
    'All Text': [] as string[],
    'All HTML': [] as string[],
    'Count': 0
};

export class QuerySelectorNode extends BaseNode {
    readonly typeId = 'web.query-selector';
    readonly displayName = 'Query Selector';
    readonly category = WebQueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' },
        { name: 'Selector', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'First Text', outputType: 'core:string' },
        { name: 'First HTML', outputType: 'core:string' },
        { name: 'All Text', outputType: 'core:string-array' },
        { name: 'All HTML', outputType: 'core:string-array' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'selector', label: 'Selector', type: 'string', defaultValue: '' },
        { name: 'trim', label: 'Trim Whitespace', type: 'boolean', defaultValue: true },
        { name: 'collapseWhitespace', label: 'Collapse Whitespace', type: 'boolean', defaultValue: true }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        const selector = (inputs['Selector'] != null ? String(inputs['Selector']) : '') || String(properties['selector'] || '');
        if (!selector) return EMPTY_OUTPUTS;

        const trim = properties['trim'] !== false;
        const collapse = properties['collapseWhitespace'] !== false;

        try {
            const $ = cheerio.load(html);
            const matched = $(selector);
            const count = matched.length;

            const firstText = normalizeText(matched.first().text(), trim, collapse);
            const firstHtml = matched.first().html() ?? '';

            const allText = matched.map((_, el) => normalizeText($(el).text(), trim, collapse)).get();
            const allHtml = matched.map((_, el) => $(el).html() ?? '').get();

            return { 'First Text': firstText, 'First HTML': firstHtml, 'All Text': allText, 'All HTML': allHtml, 'Count': count };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
