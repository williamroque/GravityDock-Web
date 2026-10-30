import { ExecuteNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import type { GravityDockAPI } from '@gravitydock/types';
import { WebRequestCategory } from '../../category';
import { parseFetchResult, headersToRows, dataframeRowsToHeaders } from '../../utils/fetchResponse';
import * as aq from 'arquero';

declare const gravityDock: GravityDockAPI;

const USER_AGENTS: Record<string, string> = {
    'Default': '',
    'Desktop Chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mobile Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Googlebot': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export class FetchPageNode extends ExecuteNode {
    readonly typeId = 'web.fetch-page';
    readonly displayName = 'Fetch Page';
    readonly category = WebRequestCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'URL', acceptsType: 'core:string' },
        { name: 'Headers', acceptsType: 'core:dataframe' },
        { name: 'Body', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'HTML', outputType: 'core:string' },
        { name: 'Status', outputType: 'core:number' },
        { name: 'Success', outputType: 'core:boolean' },
        { name: 'Headers', outputType: 'core:dataframe' },
        { name: 'Error', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'url', label: 'URL', type: 'string', defaultValue: '' },
        {
            name: 'method',
            label: 'Method',
            type: 'select',
            options: [
                { label: 'GET', value: 'GET' },
                { label: 'POST', value: 'POST' },
                { label: 'PUT', value: 'PUT' },
                { label: 'PATCH', value: 'PATCH' },
                { label: 'DELETE', value: 'DELETE' },
                { label: 'HEAD', value: 'HEAD' }
            ],
            defaultValue: 'GET'
        },
        {
            name: 'userAgent',
            label: 'User Agent',
            type: 'select',
            options: [
                { label: 'Default', value: 'Default' },
                { label: 'Desktop Chrome', value: 'Desktop Chrome' },
                { label: 'Mobile Safari', value: 'Mobile Safari' },
                { label: 'Googlebot', value: 'Googlebot' }
            ],
            defaultValue: 'Default'
        },
        { name: 'timeout', label: 'Timeout (ms)', type: 'number', defaultValue: 10000 },
        { name: 'followRedirects', label: 'Follow Redirects', type: 'boolean', defaultValue: true }
    ];

    private emptyHeaders(): any {
        return { __arqueroData: [] };
    }

    private emptyOutputs(error = '') {
        return {
            'HTML': '',
            'Status': 0,
            'Success': false,
            'Headers': this.emptyHeaders(),
            'Error': error,
            'Event': true
        };
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const url = (inputs['URL'] != null ? String(inputs['URL']) : '') || String(properties['url'] || '');
        if (!url) return this.emptyOutputs('URL is required');

        const method = String(properties['method'] || 'GET').toUpperCase();
        const uaKey = String(properties['userAgent'] || 'Default');
        const ua = USER_AGENTS[uaKey] ?? '';

        const defaultHeaders: Record<string, string> = {};
        if (ua) defaultHeaders['User-Agent'] = ua;

        const inputHeaderRows: any[] = inputs['Headers']?.__arqueroData ?? [];
        const inputHeaders = dataframeRowsToHeaders(inputHeaderRows);
        const mergedHeaders = { ...defaultHeaders, ...inputHeaders };

        const fetchOptions: any = { method, headers: mergedHeaders };
        if (BODY_METHODS.has(method) && inputs['Body'] != null) {
            fetchOptions.body = String(inputs['Body']);
        }

        try {
            const raw = await gravityDock.net.fetch(url, fetchOptions);
            const result = parseFetchResult(raw);
            const headerRows = headersToRows(result.headers);

            return {
                'HTML': result.text,
                'Status': result.status,
                'Success': result.ok,
                'Headers': { __arqueroData: aq.from(headerRows).objects() },
                'Error': '',
                'Event': true
            };
        } catch (e: any) {
            return this.emptyOutputs(e.message || String(e));
        }
    }
}
