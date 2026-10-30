import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebSemanticCategory } from '../../category';
import * as cheerio from 'cheerio';
import * as aq from 'arquero';

interface MetaRow { key: string; value: string }

const EMPTY_OUTPUTS = {
    'Metadata': { __arqueroData: [] as MetaRow[] },
    'Title': '',
    'Description': '',
    'Image': ''
};

export class ExtractMetadataNode extends BaseNode {
    readonly typeId = 'web.extract-metadata';
    readonly displayName = 'Extract Metadata';
    readonly category = WebSemanticCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Metadata', outputType: 'core:dataframe' },
        { name: 'Title', outputType: 'core:string' },
        { name: 'Description', outputType: 'core:string' },
        { name: 'Image', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [];

    async evaluate(inputs: Record<string, any>, _properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        try {
            const $ = cheerio.load(html);

            const byName = (name: string) => $(`meta[name="${name}"]`).attr('content') ?? '';
            const byProp = (prop: string) => $(`meta[property="${prop}"]`).attr('content') ?? '';

            const extracted: Record<string, string> = {
                'title': $('title').text().trim(),
                'description': byName('description'),
                'canonical': $('link[rel="canonical"]').attr('href') ?? '',
                'favicon': $('link[rel="icon"]').attr('href') ?? $('link[rel="shortcut icon"]').attr('href') ?? '',
                'og:title': byProp('og:title'),
                'og:description': byProp('og:description'),
                'og:image': byProp('og:image'),
                'og:url': byProp('og:url'),
                'og:type': byProp('og:type'),
                'twitter:card': byName('twitter:card'),
                'twitter:title': byName('twitter:title'),
                'twitter:image': byName('twitter:image')
            };

            const rows: MetaRow[] = Object.entries(extracted).map(([key, value]) => ({ key, value }));

            return {
                'Metadata': { __arqueroData: aq.from(rows).objects() },
                'Title': extracted['title'],
                'Description': extracted['description'],
                'Image': extracted['og:image'] || extracted['twitter:image']
            };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
