import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebRequestCategory } from '../../category';

const EMPTY_OUTPUTS = { 'URL': '', 'Origin': '', 'Pathname': '', 'Search': '' };

export class BuildUrlNode extends BaseNode {
    readonly typeId = 'web.build-url';
    readonly displayName = 'Build URL';
    readonly category = WebRequestCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'Base URL', acceptsType: 'core:string' },
        { name: 'Query Params', acceptsType: 'core:dataframe' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'URL', outputType: 'core:string' },
        { name: 'Origin', outputType: 'core:string' },
        { name: 'Pathname', outputType: 'core:string' },
        { name: 'Search', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'baseUrl', label: 'Base URL', type: 'string', defaultValue: '' },
        { name: 'params', label: 'Query Params', description: 'Newline-separated key=value pairs. Connected dataframe overrides these.', type: 'text', defaultValue: '' }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const base = (inputs['Base URL'] != null ? String(inputs['Base URL']) : '') || String(properties['baseUrl'] || '');
        if (!base) return EMPTY_OUTPUTS;

        let url: URL;
        try {
            url = new URL(base);
        } catch {
            return EMPTY_OUTPUTS;
        }

        const propParams = String(properties['params'] || '');
        if (propParams) {
            for (const line of propParams.split('\n')) {
                const eqIdx = line.indexOf('=');
                if (eqIdx < 1) continue;
                const k = line.slice(0, eqIdx).trim();
                const v = line.slice(eqIdx + 1).trim();
                if (k) url.searchParams.set(k, v);
            }
        }

        const inputRows: any[] = inputs['Query Params']?.__arqueroData ?? [];
        for (const row of inputRows) {
            if (row && typeof row.key === 'string' && row.key) {
                url.searchParams.set(row.key, String(row.value ?? ''));
            }
        }

        return {
            'URL': url.href,
            'Origin': url.origin,
            'Pathname': url.pathname,
            'Search': url.search
        };
    }
}
