import { pdplQuotes } from './pdpl-quotes.js';

export const PDPL_RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'pdpl_grounded_answer',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      supported: { type: 'boolean' },
      explanation: { type: 'string' },
      generalGuidance: {
        type: 'string',
        description: 'General explanation only when requested, separate from legal or company rules. Otherwise empty.',
      },
      citations: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', enum: ['PDPL1', 'PDPL2', 'PDPL3', 'PDPL4', 'PDPL5'] },
            quoteId: { type: 'string' },
          },
          required: ['id', 'quoteId'],
        },
      },
    },
    required: ['supported', 'explanation', 'citations', 'generalGuidance'],
  },
};

// Constrain each source/quote pair to current evidence before generation. The
// formatter still revalidates these pairs after publication/ownership recovery.
export function groundedResponseFormat(base, results) {
  const anyOf = results
    .flatMap((result) =>
      result.data.matches.map((match) => ({
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', enum: [match.citationId] },
          quoteId: { type: 'string', enum: pdplQuotes(match.excerpt).map((quote) => quote.id) },
        },
        required: ['id', 'quoteId'],
      })),
    )
    .filter((branch) => branch.properties.quoteId.enum.length);
  const properties = base.schema.properties;
  return {
    ...base,
    schema: {
      ...base.schema,
      properties: {
        supported: properties.supported,
        citations: { ...properties.citations, ...(anyOf.length ? { items: { anyOf } } : { maxItems: 0 }) },
        explanation: properties.explanation,
        generalGuidance: properties.generalGuidance,
      },
    },
  };
}
