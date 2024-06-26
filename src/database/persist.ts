import debounce from 'lodash/debounce';
import {
  DATABASE_INSTANCE,
  ENTITY_TYPE,
  PRIMARY_KEY,
  type FactoryAPI,
  type Entity,
  type ModelDictionary,
  type PrimaryKeyType,
} from '@mswjs/data/lib/glossary';
import {
  type SerializedEntity,
  SERIALIZED_INTERNAL_PROPERTIES_KEY,
} from '@mswjs/data/lib/db/Database';
import { inheritInternalProperties } from '@mswjs/data/lib/utils/inheritInternalProperties';
import { storage, STORAGE_KEY_PREFIX } from '../utils/storage';

const DEBOUNCE_PERSIST_TIME_MS = 10;

type Models<Dictionary extends ModelDictionary> = Record<
  keyof Dictionary,
  Map<PrimaryKeyType, Entity<Dictionary, any>>
>;

type SerializedModels<Dictionary extends ModelDictionary> = Record<
  keyof Dictionary,
  Map<PrimaryKeyType, SerializedEntity>
>;

export default function persist<Dictionary extends ModelDictionary>(
  factory: FactoryAPI<Dictionary>
) {
  const db = factory[DATABASE_INSTANCE];

  const key = `${STORAGE_KEY_PREFIX}/${db.id}`;

  const persistState = debounce(function persistState() {
    // eslint-disable-next-line dot-notation
    const models = db['models'] as Models<Dictionary>;

    // eslint-disable-next-line dot-notation
    const serializeEntity = db['serializeEntity'] as (
      entity: Entity<Dictionary, any>
    ) => SerializedEntity;

    const json = Object.fromEntries(
      Object.entries(models).map(([modelName, entities]) => [
        modelName,
        Array.from(entities, ([, entity]) => serializeEntity(entity)),
      ])
    );

    storage.set(key, JSON.stringify(json));
  }, DEBOUNCE_PERSIST_TIME_MS);

  function hydrateState() {
    const initialState = storage.getString(key);

    if (initialState) {
      const data = JSON.parse(initialState) as SerializedModels<Dictionary>;

      for (const [modelName, entities] of Object.entries(data)) {
        for (const entity of entities.values()) {
          db.create(modelName, deserializeEntity(entity));
        }
      }
    }

    // Add event listeners only after hydration
    db.events.on('create', persistState);
    db.events.on('update', persistState);
    db.events.on('delete', persistState);
  }

  hydrateState();
}

function deserializeEntity(entity: SerializedEntity) {
  const {
    [SERIALIZED_INTERNAL_PROPERTIES_KEY]: internalProperties,
    ...publicProperties
  } = entity;

  inheritInternalProperties(publicProperties, {
    [ENTITY_TYPE]: internalProperties.entityType,
    [PRIMARY_KEY]: internalProperties.primaryKey,
  });

  // eslint-disable-next-line, @typescript-eslint/no-explicit-any
  return publicProperties as Entity<any, any>;
}
