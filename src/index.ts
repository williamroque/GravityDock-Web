import { FetchPageNode } from './nodes/request/FetchPageNode';
import { BuildUrlNode } from './nodes/request/BuildUrlNode';
import { QuerySelectorNode } from './nodes/query/QuerySelectorNode';
import { ExtractAttributeNode } from './nodes/query/ExtractAttributeNode';
import { ExtractLinksNode } from './nodes/query/ExtractLinksNode';
import { ExtractImagesNode } from './nodes/query/ExtractImagesNode';
import { HtmlTableToDataframeNode } from './nodes/structured/HtmlTableToDataframeNode';
import { SchemaScraperNode } from './nodes/structured/SchemaScraperNode';
import { ExtractArticleNode } from './nodes/semantic/ExtractArticleNode';
import { ExtractMetadataNode } from './nodes/semantic/ExtractMetadataNode';
import { AsPdfNode } from './nodes/export/AsPdfNode';
import type { GravityDockAPI } from '@gravitydock/types';

declare const gravityDock: GravityDockAPI;

const nodes = [
    new FetchPageNode(),
    new BuildUrlNode(),
    new QuerySelectorNode(),
    new ExtractAttributeNode(),
    new ExtractLinksNode(),
    new ExtractImagesNode(),
    new HtmlTableToDataframeNode(),
    new SchemaScraperNode(),
    new ExtractArticleNode(),
    new ExtractMetadataNode(),
    new AsPdfNode()
];

const serializableNodes = nodes.map(n => ({
    typeId: n.typeId,
    displayName: n.displayName,
    category: n.category,
    nodeInterface: n.nodeInterface,
    visible: n.visible,
    inputs: n.inputs,
    outputs: n.outputs,
    properties: n.properties,
    dynamicInputs: n.dynamicInputs,
    dynamicOutputs: n.dynamicOutputs
}));

gravityDock.registerNodes(serializableNodes);

const deserialize = (obj: any): any => {
    if (!obj) return obj;
    if (obj.__arqueroData) {
        return obj.__arqueroData;
    }
    if (Array.isArray(obj)) return obj.map(deserialize);
    if (typeof obj === 'object') {
        const res: any = {};
        for (const k in obj) res[k] = deserialize(obj[k]);
        return res;
    }
    return obj;
};

const serialize = (obj: any): any => {
    if (!obj) return obj;
    if (typeof obj.numRows === 'function' && typeof obj.columnNames === 'function') {
        return { __arqueroData: obj.objects() };
    }
    if (Array.isArray(obj)) return obj.map(serialize);
    if (typeof obj === 'object') {
        const res: any = {};
        for (const k in obj) res[k] = serialize(obj[k]);
        return res;
    }
    return obj;
};

gravityDock.onEvaluateNode(async ({ typeId, inputs, properties }: any) => {
    const node = nodes.find(n => n.typeId === typeId);
    if (!node) throw new Error(`Unknown node type: ${typeId}`);
    const parsedInputs = deserialize(inputs);
    const result = await node.evaluate(parsedInputs, properties);
    return serialize(result);
});
