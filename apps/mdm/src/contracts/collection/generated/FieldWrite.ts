/* Generated from Collection.json. Do not edit. */

export type FieldChange =
  | {
      action: 'put'
      definition: FieldDefinition
    }
  | {
      action: 'delete'
    }
/**
 * Platform applicable to a field or collector.
 */
export type Platform = 'windows' | 'macos'
/**
 * Operations are selected explicitly; missing data is never filled implicitly.
 */
export type TelemetryAggregation =
  | 'min'
  | 'max'
  | 'sum'
  | 'count'
  | 'mean'
  | 'increase'
  | 'rate'
  | 'timeline'
  | 'transitions'
  | 'coverage'
/**
 * Element schema.
 */
export type ValueType1 =
  | {
      kind: 'record'
      /**
       * Declared members.
       */
      properties: {
        [k: string]: Property
      }
    }
  | {
      /**
       * Whether empty text is allowed.
       */
      allowEmpty: boolean
      kind: 'string'
      /**
       * Character budget.
       */
      maxLength: number
    }
  | {
      kind: 'enum'
      /**
       * Permitted nonempty values.
       *
       * @minItems 1
       * @maxItems 128
       */
      values: string[]
    }
  | {
      kind: 'integer'
    }
  | {
      kind: 'number'
    }
  | {
      kind: 'boolean'
    }
  | {
      kind: 'time'
    }
  | {
      items: ValueType1
      kind: 'array'
      /**
       * Maximum number of values.
       */
      maxItems: number
    }
  | {
      kind: 'object'
      /**
       * Property schema by literal name.
       */
      properties: {
        [k: string]: ValueType
      }
    }
/**
 * Closed structural schema for one field; every property is explicit and required.
 */
export type ValueType =
  | {
      kind: 'record'
      /**
       * Declared members.
       */
      properties: {
        [k: string]: Property
      }
    }
  | {
      /**
       * Whether empty text is allowed.
       */
      allowEmpty: boolean
      kind: 'string'
      /**
       * Character budget.
       */
      maxLength: number
    }
  | {
      kind: 'enum'
      /**
       * Permitted nonempty values.
       *
       * @minItems 1
       * @maxItems 128
       */
      values: string[]
    }
  | {
      kind: 'integer'
    }
  | {
      kind: 'number'
    }
  | {
      kind: 'boolean'
    }
  | {
      kind: 'time'
    }
  | {
      items: ValueType1
      kind: 'array'
      /**
       * Maximum number of values.
       */
      maxItems: number
    }
  | {
      kind: 'object'
      /**
       * Property schema by literal name.
       */
      properties: {
        [k: string]: ValueType
      }
    }

export interface FieldWrite {
  expectedRevision: number
  input: FieldChange
  operationId: string
}
/**
 * A published field version. No time-based expiry and no execution permission.
 */
export interface FieldDefinition {
  /**
   * Optional stable item-key property for a structured inventory list.
   */
  itemKey: string | null
  /**
   * Stable field identity.
   */
  key: string
  /**
   * Whether management assignment is permitted.
   */
  manual: boolean
  /**
   * Accept explicit null as distinct from deletion.
   */
  nullable: boolean
  /**
   * Supported platforms.
   *
   * @minItems 1
   * @maxItems 2
   */
  platforms: Platform[]
  /**
   * Whether this field participates in conditions/search.
   */
  searchable: boolean
  /**
   * Read/filter visibility classification.
   */
  sensitivity: 'standard' | 'sensitive' | 'secret'
  /**
   * Allowed sources with priority; lower numbers win, equal numbers require consensus.
   */
  sources: {
    [k: string]: number
  }
  /**
   * Optional history binding; absence means this field has no time-series capability.
   */
  timeSeries?: TimeSeriesBinding | null
  /**
   * Exact optional unit; no implicit conversion.
   */
  unit: string | null
  /**
   * Exact bounded type.
   */
  valueType:
    | {
        kind: 'record'
        /**
         * Declared members.
         */
        properties: {
          [k: string]: Property
        }
      }
    | {
        /**
         * Whether empty text is allowed.
         */
        allowEmpty: boolean
        kind: 'string'
        /**
         * Character budget.
         */
        maxLength: number
      }
    | {
        kind: 'enum'
        /**
         * Permitted nonempty values.
         *
         * @minItems 1
         * @maxItems 128
         */
        values: string[]
      }
    | {
        kind: 'integer'
      }
    | {
        kind: 'number'
      }
    | {
        kind: 'boolean'
      }
    | {
        kind: 'time'
      }
    | {
        items: ValueType1
        kind: 'array'
        /**
         * Maximum number of values.
         */
        maxItems: number
      }
    | {
        kind: 'object'
        /**
         * Property schema by literal name.
         */
        properties: {
          [k: string]: ValueType
        }
      }
  /**
   * Monotonic published version.
   */
  version: number
}
/**
 * A field's optional history capability, validated against the Inventory catalog.
 */
export interface TimeSeriesBinding {
  /**
   * Explicit operations permitted for this field.
   */
  aggregations: TelemetryAggregation[]
  /**
   * Closed dimensions. Device/resource/source identities are not arbitrary dimensions.
   */
  dimensions: {
    [k: string]: TelemetryDimension
  }
  /**
   * Counter start in UTC microseconds, extracted per item for structured counters.
   */
  intervalStartPath?: string[] | null
  /**
   * Numeric or finite-state interpretation.
   */
  kind: 'gauge' | 'cumulative_counter' | 'delta_counter' | 'state'
  /**
   * Maximum expanded resources per device and field.
   */
  maxResources: number
  retention: RetentionReference
  /**
   * Scalar property path; an array root is expanded using the field's stable item key.
   */
  valuePath: string[]
}
/**
 * One bounded dimension extracted from a declared object property path.
 */
export interface TelemetryDimension {
  /**
   * Literal property names relative to each selected item, not executable expressions.
   */
  path: string[]
  /**
   * Closed admitted vocabulary, including numeric dimensions rendered canonically.
   */
  values: string[]
}
/**
 * Versioned product policy, never an asset TTL.
 */
export interface RetentionReference {
  /**
   * Tenant-local policy key.
   */
  key: string
  /**
   * Exact policy revision.
   */
  revision: number
}
/**
 * One explicitly declared record member.
 */
export interface Property {
  /**
   * Whether the producer must include this member.
   */
  required: boolean
  /**
   * Exact type when present.
   */
  valueType:
    | {
        kind: 'record'
        /**
         * Declared members.
         */
        properties: {
          [k: string]: Property
        }
      }
    | {
        /**
         * Whether empty text is allowed.
         */
        allowEmpty: boolean
        kind: 'string'
        /**
         * Character budget.
         */
        maxLength: number
      }
    | {
        kind: 'enum'
        /**
         * Permitted nonempty values.
         *
         * @minItems 1
         * @maxItems 128
         */
        values: string[]
      }
    | {
        kind: 'integer'
      }
    | {
        kind: 'number'
      }
    | {
        kind: 'boolean'
      }
    | {
        kind: 'time'
      }
    | {
        items: ValueType1
        kind: 'array'
        /**
         * Maximum number of values.
         */
        maxItems: number
      }
    | {
        kind: 'object'
        /**
         * Property schema by literal name.
         */
        properties: {
          [k: string]: ValueType
        }
      }
}
