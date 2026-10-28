import type { FieldImpact } from './FieldImpact'
export declare function validateFieldImpact(value: unknown): value is FieldImpact
import type { FieldMappingReference } from './FieldMappingReference'
export declare function validateFieldMappingReference(
  value: unknown,
): value is FieldMappingReference
import type { FieldReferenceQuery } from './FieldReferenceQuery'
export declare function validateFieldReferenceQuery(
  value: unknown,
): value is FieldReferenceQuery
import type { FieldView } from './FieldView'
export declare function validateFieldView(value: unknown): value is FieldView
import type { FieldWrite } from './FieldWrite'
export declare function validateFieldWrite(value: unknown): value is FieldWrite
import type { ResourceResponse } from './ResourceResponse'
export declare function validateResourceResponse(value: unknown): value is ResourceResponse
import type { ResourceWrite } from './ResourceWrite'
export declare function validateResourceWrite(value: unknown): value is ResourceWrite
import type { ScriptDefinition } from './ResourceWrite'
export declare function validateScriptDefinition(value: unknown): value is ScriptDefinition
import type { TelemetryProfile } from './ResourceWrite'
export declare function validateTelemetryProfile(value: unknown): value is TelemetryProfile
import type { ValueMapping } from './ResourceWrite'
export declare function validateValueMapping(value: unknown): value is ValueMapping
import type { Applicability } from './ResourceWrite'
export declare function validateApplicability(value: unknown): value is Applicability
import type { NativeCollectionDefinition } from './ResourceWrite'
export declare function validateNativeCollectionDefinition(
  value: unknown,
): value is NativeCollectionDefinition
import type { AgentCollectionDefinition } from './ResourceWrite'
export declare function validateAgentCollectionDefinition(
  value: unknown,
): value is AgentCollectionDefinition
import type { SoftwareDefinition } from './ResourceWrite'
export declare function validateSoftwareDefinition(value: unknown): value is SoftwareDefinition
import type { FieldDefinition } from './FieldWrite'
export declare function validateFieldDefinition(value: unknown): value is FieldDefinition
export declare function validateFieldViewItemKey(value: unknown): value is FieldView['itemKey']
export declare function validateFieldViewKey(value: unknown): value is FieldView['key']
export declare function validateFieldViewManual(value: unknown): value is FieldView['manual']
export declare function validateFieldViewNullable(
  value: unknown,
): value is FieldView['nullable']
export declare function validateFieldViewOperations(
  value: unknown,
): value is FieldView['operations']
export declare function validateFieldViewPlatforms(
  value: unknown,
): value is FieldView['platforms']
export declare function validateFieldViewSearchable(
  value: unknown,
): value is FieldView['searchable']
export declare function validateFieldViewSensitivity(
  value: unknown,
): value is FieldView['sensitivity']
export declare function validateFieldViewSources(value: unknown): value is FieldView['sources']
export declare function validateFieldViewTimeSeries(
  value: unknown,
): value is FieldView['timeSeries']
export declare function validateFieldViewUnit(value: unknown): value is FieldView['unit']
export declare function validateFieldViewValueType(
  value: unknown,
): value is FieldView['valueType']
export declare function validateFieldViewVersion(value: unknown): value is FieldView['version']
