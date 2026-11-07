import { ExecuteNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { WebExportCategory } from '../../category';
import { generatePdfFromHtml } from '../../utils/pdfGenerator';
import { parseFetchResult } from '../../utils/fetchResponse';

declare const gravityDock: GravityDockAPI;

export class AsPdfNode extends ExecuteNode {
    readonly typeId = 'web.as-pdf';
    readonly displayName = 'As PDF';
    readonly category = WebExportCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: ['core:string', 'core:render'] },
        { name: 'URL', acceptsType: 'core:string' },
        { name: 'Path', acceptsType: ['core:path', 'core:string'] }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'PDF', outputType: 'core:string' },
        { name: 'Path', outputType: 'core:path' },
        { name: 'Pages', outputType: 'core:number' },
        { name: 'Size', outputType: 'core:number' },
        { name: 'Success', outputType: 'core:boolean' },
        { name: 'Error', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'url',
            label: 'URL',
            description: 'URL to fetch and convert if HTML input is not provided',
            type: 'string',
            defaultValue: ''
        },
        {
            name: 'pageSize',
            label: 'Page Size',
            description: 'Standard paper size for the PDF document',
            type: 'select',
            options: [
                { label: 'A4', value: 'A4' },
                { label: 'Letter', value: 'Letter' },
                { label: 'Legal', value: 'Legal' },
                { label: 'A3', value: 'A3' },
                { label: 'A5', value: 'A5' }
            ],
            defaultValue: 'A4'
        },
        {
            name: 'orientation',
            label: 'Orientation',
            description: 'Page orientation (portrait or landscape)',
            type: 'select',
            options: [
                { label: 'Portrait', value: 'portrait' },
                { label: 'Landscape', value: 'landscape' }
            ],
            defaultValue: 'portrait'
        },
        {
            name: 'marginTop',
            label: 'Margin Top (pt)',
            description: 'Top page margin in points (72 pt = 1 inch)',
            type: 'number',
            defaultValue: 36,
            min: 0,
            step: 1
        },
        {
            name: 'marginBottom',
            label: 'Margin Bottom (pt)',
            description: 'Bottom page margin in points',
            type: 'number',
            defaultValue: 36,
            min: 0,
            step: 1
        },
        {
            name: 'marginLeft',
            label: 'Margin Left (pt)',
            description: 'Left page margin in points',
            type: 'number',
            defaultValue: 36,
            min: 0,
            step: 1
        },
        {
            name: 'marginRight',
            label: 'Margin Right (pt)',
            description: 'Right page margin in points',
            type: 'number',
            defaultValue: 36,
            min: 0,
            step: 1
        },
        {
            name: 'fontFamily',
            label: 'Font Family',
            description: 'Primary typeface for document content (e.g. Helvetica, Times-Roman, Courier)',
            type: 'string',
            defaultValue: 'Helvetica'
        },
        {
            name: 'fontSize',
            label: 'Font Size (pt)',
            description: 'Base font size for body text',
            type: 'number',
            defaultValue: 11,
            min: 6,
            step: 1
        },
        {
            name: 'lineHeight',
            label: 'Line Height',
            description: 'Line height multiplier for text paragraphs',
            type: 'number',
            defaultValue: 1.4,
            min: 1.0,
            step: 0.1
        },
        {
            name: 'includeHeader',
            label: 'Include Header',
            description: 'Display running header at the top of each page',
            type: 'boolean',
            defaultValue: false
        },
        {
            name: 'headerText',
            label: 'Header Text',
            description: 'Running header template (supports {page}, {total}, and {title})',
            type: 'string',
            defaultValue: ''
        },
        {
            name: 'includeFooter',
            label: 'Include Footer',
            description: 'Display running footer at the bottom of each page',
            type: 'boolean',
            defaultValue: true
        },
        {
            name: 'footerText',
            label: 'Footer Text',
            description: 'Running footer template (supports {page}, {total}, and {title})',
            type: 'string',
            defaultValue: 'Page {page} of {total}'
        },
        {
            name: 'title',
            label: 'Document Title',
            description: 'PDF document title metadata and top heading',
            type: 'string',
            defaultValue: ''
        },
        {
            name: 'author',
            label: 'Author',
            description: 'Author metadata in PDF properties',
            type: 'string',
            defaultValue: ''
        },
        {
            name: 'filePath',
            label: 'Save To File',
            description: 'Optional filesystem destination path to write the PDF file',
            type: 'filepath',
            defaultValue: '',
            dialogProperties: ['saveFile'],
            filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
        }
    ];

    private emptyOutputs(error = '') {
        return {
            'PDF': '',
            'Path': '',
            'Pages': 0,
            'Size': 0,
            'Success': false,
            'Error': error,
            'Event': true
        };
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        let html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        const url = (inputs['URL'] != null ? String(inputs['URL']) : '') || String(properties['url'] || '');
        const targetPath = (inputs['Path'] != null ? String(inputs['Path']) : '') || String(properties['filePath'] || '');

        if (!html && url) {
            try {
                const raw = await gravityDock.net.fetch(url);
                const res = parseFetchResult(raw);
                if (!res.ok) {
                    return this.emptyOutputs(`Failed to fetch URL (${res.status} ${res.statusText})`);
                }
                html = res.text;
            } catch (err: any) {
                return this.emptyOutputs(`Fetch error: ${err.message || String(err)}`);
            }
        }

        if (!html) {
            return this.emptyOutputs('HTML or URL input is required');
        }

        try {
            const pdfResult = generatePdfFromHtml(html, {
                pageSize: String(properties['pageSize'] || 'A4'),
                orientation: String(properties['orientation'] || 'portrait'),
                marginTop: Number(properties['marginTop'] ?? 36),
                marginBottom: Number(properties['marginBottom'] ?? 36),
                marginLeft: Number(properties['marginLeft'] ?? 36),
                marginRight: Number(properties['marginRight'] ?? 36),
                fontFamily: String(properties['fontFamily'] || 'Helvetica'),
                fontSize: Number(properties['fontSize'] ?? 11),
                lineHeight: Number(properties['lineHeight'] ?? 1.4),
                includeHeader: Boolean(properties['includeHeader'] ?? false),
                headerText: String(properties['headerText'] || ''),
                includeFooter: Boolean(properties['includeFooter'] ?? true),
                footerText: String(properties['footerText'] || 'Page {page} of {total}'),
                title: String(properties['title'] || ''),
                author: String(properties['author'] || '')
            });

            if (targetPath && gravityDock?.fs?.writeFile) {
                await gravityDock.fs.writeFile(targetPath, pdfResult.pdfString);
            }

            return {
                'PDF': pdfResult.pdfString,
                'Path': targetPath || '',
                'Pages': pdfResult.pageCount,
                'Size': pdfResult.byteLength,
                'Success': true,
                'Error': '',
                'Event': true
            };
        } catch (err: any) {
            return this.emptyOutputs(`PDF generation error: ${err.message || String(err)}`);
        }
    }
}
