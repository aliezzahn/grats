import * as ts from "typescript";
import {
  ConstDirectiveNode,
  GraphQLField,
  GraphQLSchema,
  isInterfaceType,
} from "graphql";
import {
  DiagnosticsWithoutLocationResult,
  gqlErr,
  gqlRelated,
} from "../utils/DiagnosticError";
import { err, ok } from "../utils/Result";
import { ConfigOptions } from "../gratsConfig";
import { SEMANTIC_NON_NULL_DIRECTIVE } from "../metadataDirectives";
import { astNode, loc } from "../utils/helpers";

/**
 * Ensure that all semantically non-nullable fields on an interface are
 */
export function validateSemanticNullability(
  schema: GraphQLSchema,
  config: ConfigOptions,
): DiagnosticsWithoutLocationResult<GraphQLSchema> {
  if (!config.strictSemanticNullability) {
    return ok(schema);
  }
  const typenameDiagnostics: ts.Diagnostic[] = [];
  const interfaces = Object.values(schema.getTypeMap()).filter(isInterfaceType);
  for (const interfaceType of interfaces) {
    const typeImplementors = schema.getPossibleTypes(interfaceType);
    for (const interfaceField of Object.values(interfaceType.getFields())) {
      if (astNode(interfaceField).type.kind === "NonNullType") {
        // Type checking of non-null types is handled by graphql-js. If this field is non-null,
        // then validation has already asserted that all implementors are non-null meaning no
        // "semantic" non-null types can be present.
        continue;
      }

      const interfaceSemanticNonNull = findSemanticNonNull(interfaceField);
      if (interfaceSemanticNonNull == null) {
        // It's fine for implementors to be more strict, since they are still
        // covariant with the less strict interface.
        continue;
      }

      for (const implementor of typeImplementors) {
        const implementorField = implementor.getFields()[interfaceField.name];
        if (implementorField == null) {
          throw new Error(
            "Expected implementorField to be defined. We expected this to be caught by graphql-js validation. This is a bug in Grats. Please report it.",
          );
        }
        const typeSemanticNonNull = findSemanticNonNull(implementorField);

        if (typeSemanticNonNull == null) {
          typenameDiagnostics.push(
            gqlErr(
              loc(interfaceSemanticNonNull),
              `Interface field \`${implementor.name}.${implementorField.name}\` expects a non-nullable type but \`${interfaceType.name}.${interfaceField.name}\` is nullable.`,
              [
                gqlRelated(
                  loc(astNode(implementorField).type),
                  "Related location",
                ),
              ],
            ),
          );
        }
      }
    }
  }
  if (typenameDiagnostics.length > 0) {
    return err(typenameDiagnostics);
  }
  return ok(schema);
}

function findSemanticNonNull(
  field: GraphQLField<unknown, unknown>,
): ConstDirectiveNode | null {
  return (
    astNode(field).directives?.find(
      (d) => d.name.value === SEMANTIC_NON_NULL_DIRECTIVE,
    ) ?? null
  );
}
