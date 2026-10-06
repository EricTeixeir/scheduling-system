import { fieldErrorsOf, messageFor, type MessageContext } from './messages';

export interface ServerFormErrors<Field extends string> {
  readonly fields: ReadonlyMap<Field, string>;
  readonly formMessage: string | undefined;
}

export function splitServerErrors<Field extends string>(
  error: unknown,
  knownFields: readonly Field[],
  context: MessageContext = 'default',
): ServerFormErrors<Field> {
  const fields = new Map<Field, string>();
  let hasUnmappedField = false;
  for (const [path, message] of fieldErrorsOf(error)) {
    const field = knownFields.find((known) => known === path);
    if (field === undefined) hasUnmappedField = true;
    else fields.set(field, message);
  }
  const everythingShownInline = fields.size > 0 && !hasUnmappedField;
  return {
    fields,
    formMessage: everythingShownInline ? undefined : messageFor(error, context),
  };
}
