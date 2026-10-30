import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebQueryCategory } from '../../category';
import { resolveUrl } from '../../utils/resolveUrl';
import * as cheerio from 'cheerio';
import * as aq from 'arquero';

interface LinkRow {
    text: string;
    href: string;
    title: string;
}

const EMPTY_OUTPUTS = { 'URLs': [] as string[], 'Link Data': { __arqueroData: [] as LinkRow[] }, 'Count': 0 };

export class ExtractLinksNode extends BaseNode {
    readonly typeId = 'web.extract-links';
    readonly displayName = 'Extract Links';
    readonly category = WebQueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' },
        { name: 'Base URL', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'URLs', outputType: 'core:string-array' },
        { name: 'Link Data', outputType: 'core:dataframe' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'selector', label: 'Selector', type: 'string', defaultValue: 'a[href]' },
        { name: 'excludeFragment', label: 'Exclude Fragment Anchors', type: 'boolean', defaultValue: true },
        { name: 'excludeMailto', label: 'Exclude mailto: Links', type: 'boolean', defaultValue: true },
        { name: 'deduplicate', label: 'Deduplicate URLs', type: 'boolean', defaultValue: false }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        const baseUrl = inputs['Base URL'] != null ? String(inputs['Base URL']) : '';
        const selector = String(properties['selector'] || 'a[href]');
        const excludeFragment = properties['excludeFragment'] !== false;
        const excludeMailto = properties['excludeMailto'] !== false;
        const deduplicate = properties['deduplicate'] === true;

        try {
            const $ = cheerio.load(html);
            const rows: LinkRow[] = [];

            $(selector).each((_, el) => {
                const rawHref = $(el).attr('href') ?? '';
                if (excludeMailto && rawHref.startsWith('mailto:')) return;

                const href = resolveUrl(rawHref, baseUrl);
                if (!href) return;

                if (excludeFragment) {
                    try {
                        const parsed = new URL(href);
                        const baseOriginPath = baseUrl ? new URL(baseUrl).href.split('#')[0] : '';
                        if (parsed.hash && parsed.href.split('#')[0] === baseOriginPath) return;
                        if (!parsed.hash && rawHref.startsWith('#')) return;
                    } catch {
                        if (rawHref.startsWith('#')) return;
                    }
                }

                rows.push({
                    text: $(el).text().trim(),
                    href,
                    title: $(el).attr('title') ?? ''
                });
            });

            let urls = rows.map(r => r.href);
            let finalRows = rows;

            if (deduplicate) {
                const seen = new Set<string>();
                finalRows = rows.filter(r => {
                    if (seen.has(r.href)) return false;
                    seen.add(r.href);
                    return true;
                });
                urls = finalRows.map(r => r.href);
            }

            return {
                'URLs': urls,
                'Link Data': { __arqueroData: aq.from(finalRows).objects() },
                'Count': finalRows.length
            };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
