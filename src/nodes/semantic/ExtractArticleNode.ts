import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebSemanticCategory } from '../../category';
import * as cheerio from 'cheerio';

const CONTENT_ROOT_SELECTORS = ['article', 'main', '[role="main"]', 'body'];
const EMPTY_OUTPUTS = { 'Text': '', 'Title': '', 'Word Count': 0 };

export class ExtractArticleNode extends BaseNode {
    readonly typeId = 'web.extract-article';
    readonly displayName = 'Extract Article';
    readonly category = WebSemanticCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Text', outputType: 'core:string' },
        { name: 'Title', outputType: 'core:string' },
        { name: 'Word Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'contentSelector', label: 'Content Selector', description: 'Override automatic content detection with a specific CSS selector.', type: 'string', defaultValue: '' },
        {
            name: 'removeSelectors',
            label: 'Remove Selectors',
            description: 'Comma-separated CSS selectors to strip before extraction.',
            type: 'text',
            defaultValue: 'script, style, nav, footer, aside, header, .ad, .ads, .advertisement, .cookie'
        },
        { name: 'collapseWhitespace', label: 'Collapse Whitespace', type: 'boolean', defaultValue: true }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        try {
            const $ = cheerio.load(html);

            const removeSelectors = String(properties['removeSelectors'] || '');
            for (const sel of removeSelectors.split(',').map(s => s.trim()).filter(Boolean)) {
                try { $(sel).remove(); } catch { /* ignore invalid selectors */ }
            }

            const title = $('title').text().trim() || $('h1').first().text().trim();

            const contentSel = String(properties['contentSelector'] || '').trim();
            let contentRoot: cheerio.Cheerio<any>;

            if (contentSel) {
                contentRoot = $(contentSel).first();
            } else {
                contentRoot = $();
                for (const sel of CONTENT_ROOT_SELECTORS) {
                    const candidate = $(sel).first();
                    if (candidate.length && candidate.text().trim()) {
                        contentRoot = candidate;
                        break;
                    }
                }
            }

            let text = contentRoot.length ? contentRoot.text() : $('body').text();

            if (properties['collapseWhitespace'] !== false) {
                text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
            }

            const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

            return { 'Text': text, 'Title': title, 'Word Count': wordCount };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
