# mongoose-log-history

[![CI](https://github.com/granitebps/mongoose-log-history/actions/workflows/ci.yml/badge.svg)](https://github.com/granitebps/mongoose-log-history/actions)
[![npm version](https://img.shields.io/npm/v/mongoose-log-history.svg)](https://www.npmjs.com/package/mongoose-log-history)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/mongoose-log-history.svg)](https://www.npmjs.com/package/mongoose-log-history)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat)](https://prettier.io/)

> **Requirements**
>
> - Node.js **18** or higher
> - Mongoose **8** or higher

A Mongoose plugin to **automatically track and log changes** (create, update, delete, and soft delete) to your models, with detailed audit history and flexible configuration.

---

## Features

- **Full TypeScript support** with comprehensive type definitions
- Tracks create, update, delete, and soft delete operations on your Mongoose models
- Field-level change tracking (including nested fields and arrays)
- Flexible configuration: choose which fields to track, handle arrays, soft deletes, and more
- Batch operation support: efficiently logs bulk inserts, updates, and deletes
- Contextual logging: add extra context fields from your documents or array items
- Single or per-model log collections
- Optional full document snapshot in logs
- Custom logger support
- Exposes internal helpers for manual logging
- Easy integration: just add as a plugin to your schema

---

## Installation

```bash
npm install mongoose-log-history mongoose
```

For TypeScript projects, the package includes built-in type definitions:

```bash
npm install mongoose-log-history mongoose @types/mongoose
```

---

## Usage

### Basic Example

```js
const mongoose = require('mongoose');
const { changeLoggingPlugin } = require('mongoose-log-history');

const orderSchema = new mongoose.Schema({
  status: String,
  tags: [String],
  items: [
    {
      sku: String,
      qty: Number,
      price: Number,
    },
  ],
  created_by: {
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    role: String,
  },
});

// Add the plugin
orderSchema.plugin(changeLoggingPlugin, {
  modelName: 'order',
  trackedFields: [
    { value: 'status' },
    { value: 'tags', arrayType: 'simple' },
    {
      value: 'items',
      arrayType: 'custom-key',
      arrayKey: 'sku',
      valueField: 'qty',
      trackedFields: [{ value: 'qty' }, { value: 'price' }],
      contextFields: {
        doc: ['created_by.name'],
        item: ['sku', 'qty'],
      },
    },
  ],
  contextFields: ['created_by.name'],
  singleCollection: true, // or false for per-model collection
  saveWholeDoc: false, // set true to save full doc snapshots in logs
  maxBatchLog: 1000,
  batchSize: 100,
  logger: console, // or your custom logger
  softDelete: {
    field: 'status',
    value: 'deleted',
  },
});

const Order = mongoose.model('Order', orderSchema);
```

### TypeScript Example

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import { changeLoggingPlugin, PluginOptions } from 'mongoose-log-history';

interface IOrder extends Document {
  status: string;
  tags: string[];
  items: Array<{
    sku: string;
    qty: number;
    price: number;
  }>;
  created_by: {
    id: mongoose.Types.ObjectId;
    name: string;
    role: string;
  };
}

const orderSchema = new Schema<IOrder>({
  status: String,
  tags: [String],
  items: [
    {
      sku: String,
      qty: Number,
      price: Number,
    },
  ],
  created_by: {
    id: Schema.Types.ObjectId,
    name: String,
    role: String,
  },
});

// Type-safe plugin configuration
const pluginOptions: PluginOptions = {
  modelName: 'order',
  trackedFields: [
    { value: 'status' },
    { value: 'tags', arrayType: 'simple' },
    {
      value: 'items',
      arrayType: 'custom-key',
      arrayKey: 'sku',
      valueField: 'qty',
      trackedFields: [{ value: 'qty' }, { value: 'price' }],
      contextFields: {
        doc: ['created_by.name'],
        item: ['sku', 'qty'],
      },
    },
  ],
  contextFields: ['created_by.name'],
  singleCollection: true,
  saveWholeDoc: false,
  maxBatchLog: 1000,
  batchSize: 100,
  logger: console,
  softDelete: {
    field: 'status',
    value: 'deleted',
  },
};

orderSchema.plugin(changeLoggingPlugin, pluginOptions);

const Order = mongoose.model<IOrder>('Order', orderSchema);
```

---

## Configuration Options

| Option             | Type            | Default      | Description                                                                                                                                            |
| ------------------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modelName`        | string          | model name   | Model identification (REQUIRED)                                                                                                                        |
| `modelKeyId`       | string          | `_id`        | ID key that identifies the model                                                                                                                       |
| `softDelete`       | object/function |              | Soft delete config: `{ field, value }`. When the specified field is set to the given value, the plugin logs a `delete` operation instead of an update. |
| `contextFields`    | array           |              | Extra fields to include in the log context (array of field paths from the document itself; must be an array at the plugin level)                       |
| `singleCollection` | boolean         | `false`      | Use a single log collection for all models (`log_histories`)                                                                                           |
| `saveWholeDoc`     | boolean.        | `false`      | Save full original/updated docs in the log                                                                                                             |
| `maxBatchLog`      | number          | `1000`       | Max number of logs per batch operation                                                                                                                 |
| `batchSize`        | number          | `100`        | Number of documents to process per batch in bulk hooks                                                                                                 |
| `logger`           | object          | `console`    | Custom logger object (must support `.error` and `.warn` methods)                                                                                       |
| `trackedFields`    | array           | `[]`         | Array of field configs to track (see below)                                                                                                            |
| `userField`        | string          | `created_by` | The field in the document to extract user info from (dot notation supported). Value can be any type (object, string, ID, etc.).                        |
| `compressDocs`     | boolean         | `false`      | Compress `original_doc` and `updated_doc` using gzip.                                                                                                  |

---

### User Field Option

The `userField` option lets you specify which field in your document should be used as the "user" for log entries.

- **Supports dot notation** for nested fields.
- The value can be **anything**: an object, a string, an ID, etc.
- If not set, defaults to `'created_by'`.

**Examples:**

```js
userField: 'created_by'; // Use doc.created_by (default)
userField: 'updatedBy.name'; // Use doc.updatedBy.name
userField: 'userId'; // Use doc.userId
```

---

### Soft Delete Option

The `softDelete` option allows you to track "soft deletes"—where a document is marked as deleted by setting a specific field to a certain value, rather than being physically removed from the database.

- `field`: The name of the field that indicates deletion (e.g., `"status"` or `"is_deleted"`).
- `value`: The value that means the document is considered deleted (e.g., `"deleted"` or `true`).
- (doc: unknown): boolean : A function that takes the document and returns true if it was soft-deleted.

**Example:**

```js
softDelete: {
  field: 'status',
  value: 'deleted'
}
```

When you update a document and set `status` to `'deleted'`, the plugin will log this as a `delete` operation in the history.

**Example function:**

The `softDelete` option can also be a function that returns true if the document was soft deleted or not.

```js
softDelete: function(doc) { return doc.deletedAt !== undefined ; }
```

---

### Compression Option

**Example:**

```js
compressDocs: true;
```

When `compressDocs` is enabled, the plugin will automatically compress the `original_doc` and `updated_doc` fields in your log entries using gzip.

When you use the `getHistoriesById` static method, the plugin will **automatically decompress** these fields for you.  
You always receive plain JavaScript objects, regardless of whether compression is enabled.

> **Note:** If you query the log collection directly (not via `getHistoriesById`), you may need to manually decompress these fields using the provided utility:
>
> ```js
> const { decompressObject } = require('mongoose-log-history');
> const doc = decompressObject(logEntry.original_doc);
> ```

---

### Context Fields

The `contextFields` option allows you to include additional fields from your document in the log entry for extra context (for example, user info, organization, etc.).

#### Global `contextFields` (Plugin Option)

- **Type:** Array of field paths (dot notation supported)
- **Behavior:** The fields you define here will be extracted from the document itself and included in the log’s context.
- **Example:**
  ```js
  contextFields: ['created_by.name', 'organizationId'];
  ```

#### `contextFields` Inside `trackedFields`

You can also specify `contextFields` for individual tracked fields.  
This supports two forms:

**1. Array**

- The fields will be extracted from the document itself (just like the global option).
- Example:
  ```js
  trackedFields: [
    {
      value: 'status',
      contextFields: ['created_by.name'],
    },
  ];
  ```

**2. Object**

- The object can have two properties: `doc` and `item`.
  - `doc`: Array of field paths to extract from the document itself.
  - `item`: Array of field paths to extract from the array item (useful when tracking arrays of objects).
- Example:
  ```js
  trackedFields: [
    {
      value: 'items',
      arrayType: 'custom-key',
      arrayKey: 'sku',
      contextFields: {
        doc: ['created_by.name'],
        item: ['sku', 'qty'],
      },
    },
  ];
  ```
  In this example:
  - `created_by.name` will be extracted from the document and included in the log context.
  - `sku` and `qty` will be extracted from each item in the `items` array and included in the log context for that field change.

---

### Tracked Fields Structure

The `trackedFields` option defines **which fields** in your documents should be tracked for changes, and how to handle arrays or nested fields.

Each entry in the array can have the following properties:

| Property        | Type         | Description                                                                                 |
| --------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `value`         | string       | **(Required)** Field path to track (supports dot notation for nested fields)                |
| `arrayType`     | string       | How to handle arrays: `'simple'` (array of primitives) or `'custom-key'` (array of objects) |
| `arrayKey`      | string       | For `'custom-key'` arrays: the unique key field for each object in the array                |
| `valueField`    | string       | For `'custom-key'` arrays: the field inside the object to track                             |
| `contextFields` | array/object | Additional fields to include in the log context for this field (see above)                  |
| `trackedFields` | array        | For nested objects/arrays: additional fields inside the array/object to track               |

**Examples:**

- **Track a simple field:**

  ```js
  {
    value: 'status';
  }
  ```

- **Track a simple array:**

  ```js
  { value: 'tags', arrayType: 'simple' }
  ```

- **Track an array of objects by key, and track specific fields inside:**
  ```js
  {
    value: 'items',
    arrayType: 'custom-key',
    arrayKey: 'sku',
    valueField: 'qty',
    trackedFields: [
      { value: 'qty' },
      { value: 'price' }
    ]
  }
  ```

---

## Supported Mongoose Operations

This plugin automatically tracks changes for the following Mongoose operations:

- `save` (document create/update)
- `insertMany` (bulk create)
- `updateOne`, `updateMany`, `update` (single/bulk/legacy update)
- `findOneAndUpdate`, `findByIdAndUpdate` (single update)
- `replaceOne`, `findOneAndReplace` (single replace)
- `deleteOne`, `deleteMany` (single/bulk delete)
- `findOneAndDelete`, `findByIdAndDelete` (single delete)
- `remove`, `delete` (document instance remove/delete)

---

### Log History Document Schema

Each log entry in the log history collection has the following structure:

| Field          | Type     | Description                                                              |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `model`        | string   | The name of the model being tracked                                      |
| `model_id`     | ObjectId | The ID of the tracked document                                           |
| `change_type`  | string   | The type of change: `'create'`, `'update'`, or `'delete'`                |
| `logs`         | array    | Array of field-level change objects (see below)                          |
| `created_by`   | object   | Information about the user who made the change (if available)            |
| `context`      | object   | Additional context fields (as configured)                                |
| `original_doc` | object   | (Optional) The original document snapshot (if `saveWholeDoc` is enabled) |
| `updated_doc`  | object   | (Optional) The updated document snapshot (if `saveWholeDoc` is enabled)  |
| `is_deleted`   | boolean  | Whether the log entry is marked as deleted (for log management)          |
| `created_at`   | date     | Timestamp when the log entry was created                                 |

**Example:**

```json
{
  "model": "Order",
  "model_id": "60f7c2b8e1b1c8a1b8e1b1c8",
  "change_type": "update",
  "logs": [
    {
      "field_name": "status",
      "from_value": "pending",
      "to_value": "completed",
      "change_type": "edit",
      "context": {
        "doc": {
          "created_by.name": "Alice"
        }
      }
    }
  ],
  "created_by": {
    "id": "60f7c2b8e1b1c8a1b8e1b1c7",
    "name": "Alice",
    "role": "admin"
  },
  "context": {
    "doc": {
      "created_by.name": "Alice"
    }
  },
  "original_doc": {
    /* ... */
  },
  "updated_doc": {
    /* ... */
  },
  "is_deleted": false,
  "created_at": "2024-06-12T12:34:56.789Z"
}
```

> **Note:** The `created_by` field can be any type (object, string, ID, etc.) depending on your `userField` configuration.

---

### Log Entry Structure (`logs` field)

Each object in the `logs` array has the following structure:

| Field         | Type   | Description                                                            |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `field_name`  | string | The path of the field that changed (e.g., `"status"`, `"items.0.qty"`) |
| `from_value`  | string | The value before the change (as a string)                              |
| `to_value`    | string | The value after the change (as a string)                               |
| `change_type` | string | The type of change: `'add'`, `'edit'`, or `'remove'`                   |
| `context`     | object | (Optional) Additional context fields, as configured in `contextFields` |

---

## API Reference

### `changeLoggingPlugin(schema, options)`

Apply the plugin to your schema.

---

### `Model.getHistoriesById(modelId, fields, options)`

Get log histories for a specific document.

**Example:**

```js
const logs = await Order.getHistoriesById(orderId);
```

---

### `decompressObject(buffer)`

Decompresses a gzip-compressed Buffer (as stored in `original_doc` or `updated_doc` when `compressDocs` is enabled) and returns the original JavaScript object.

**Parameters:**

- `buffer` (`Buffer`): The compressed data.

**Returns:**

- The decompressed JavaScript object, or `null` if input is falsy.

**Example:**

```js
const { decompressObject } = require('mongoose-log-history');
const doc = decompressObject(logEntry.original_doc);
```

---

### Manual/Advanced Logging API

If you need to log changes manually (for example, in custom flows or scripts where the plugin hooks are not available), you can use these helper functions:

---

#### `getTrackedChanges(originalDoc, updatedDoc, trackedFields)`

Returns an array of change log objects describing the differences between two documents, according to your tracked fields configuration.

**Example:**

```js
const { getTrackedChanges } = require('mongoose-log-history');

const changes = getTrackedChanges(originalDoc, updatedDoc, trackedFields);
```

---

#### `buildLogEntry(modelId, modelName, changeType, logs, createdBy, originalDoc, updatedDoc, context, saveWholeDoc, compressDocs)`

Builds a log entry object compatible with the plugin’s log schema.

**Example:**

```js
const { buildLogEntry } = require('mongoose-log-history');

const logEntry = buildLogEntry(
  orderId,
  'Order',
  'update',
  changes,
  { id: userId, name: 'Alice', role: 'admin' },
  originalDoc,
  updatedDoc,
  context,
  false, // saveWholeDoc
  false // compressDocs
);
```

- `modelId`: The document's ID.
- `modelName`: The model name.
- `changeType`: The type of change ('create', 'update', 'delete').
- `logs`: Array of field-level change objects.
- `createdBy`: User info (object, string, or any type).
- `originalDoc`: The original document.
- `updatedDoc`: The updated document.
- `context`: Additional context fields.
- `saveWholeDoc`: Save full doc snapshots.
- `compressDocs`: Compress doc snapshots.

---

#### `getLogHistoryModel(modelName, singleCollection)`

Returns the Mongoose model instance for the log history collection (either single or per-model).

**Example:**

```js
const { getLogHistoryModel } = require('mongoose-log-history');

const LogHistory = getLogHistoryModel('Order', true); // true for singleCollection
await LogHistory.create(logEntry);
```

---

#### **When to use these helpers?**

- When you want to log changes outside of standard Mongoose hooks (e.g., in scripts, migrations, or custom flows).
- When you want full control over when and how logs are created.

---

### Log Pruning Utility

You can prune old or excess log entries using the `pruneLogHistory` helper:

**Delete logs older than 2 hours:**

```js
await pruneLogHistory({
  modelName: 'Order',
  singleCollection: true,
  before: '2h', // supports '2h', '1d', '1M', '1y', etc.
});
```

**Delete logs older than 1 month for a specific document:**

```js
await pruneLogHistory({
  modelName: 'Order',
  singleCollection: true,
  before: '1M',
  modelId: '60f7c2b8e1b1c8a1b8e1b1c8',
});
```

**Keep only the last 100 logs per document:**

```js
await pruneLogHistory({
  modelName: 'Order',
  singleCollection: true,
  keepLast: 100,
});
```

**Keep only the last 50 logs for a specific document:**

```js
await pruneLogHistory({
  modelName: 'Order',
  singleCollection: true,
  keepLast: 50,
  modelId: '60f7c2b8e1b1c8a1b8e1b1c8',
});
```

---

### Discriminator Support

This plugin is compatible with [Mongoose discriminators](https://mongoosejs.com/docs/discriminators.html).

- If you apply the plugin to the base schema, all discriminators will inherit the plugin and use their own model name in logs.
- If you want different logging behavior for each discriminator, you can apply the plugin to each discriminator schema with different options.
- When using per-model log collections, each discriminator will have its own log collection (e.g., `log_histories_MyDiscriminator`).
- When using a single log collection, the `model` field in each log entry will reflect the discriminator’s model name.

**Example:**

```js
const baseSchema = new mongoose.Schema({ ... });
baseSchema.plugin(changeLoggingPlugin, { ... });

const BaseModel = mongoose.model('Base', baseSchema);

const childSchema = new mongoose.Schema({ extraField: String });
const ChildModel = BaseModel.discriminator('Child', childSchema);

// Both BaseModel and ChildModel will have change logging enabled.
```

---

## Real-World Example

Suppose you want to track changes to an order’s status, tags, and items (with quantity and price):

```js
orderSchema.plugin(changeLoggingPlugin, {
  modelName: 'order',
  trackedFields: [
    { value: 'status' },
    { value: 'tags', arrayType: 'simple' },
    {
      value: 'items',
      arrayType: 'custom-key',
      arrayKey: 'sku',
      valueField: 'qty',
      trackedFields: [{ value: 'qty' }, { value: 'price' }],
      contextFields: {
        doc: ['created_by.name'],
        item: ['sku', 'qty'],
      },
    },
  ],
  contextFields: ['created_by.name'],
  singleCollection: true,
  saveWholeDoc: true,
  softDelete: {
    field: 'status',
    value: 'deleted',
  },
});
```

When you update an order’s status or items, a log entry will be created in the `log_histories` collection, showing what changed, who did it, and when.

---

## Troubleshooting

### No logs are being created

- Ensure you have added the plugin to your schema **before** compiling the model.
- Make sure you are using the correct Mongoose operations (see supported list).
- Check your `trackedFields` configuration—only changes to these fields are logged.

### Logs are missing context fields

- Double-check your `contextFields` configuration.
- If using nested fields, use dot notation (e.g., `'created_by.name'`).

### Performance issues with large bulk operations

- Adjust `batchSize` and `maxBatchLog` options to suit your workload.
- For extremely large collections, consider processing in smaller batches.

### Custom logger not working

- Your logger object must implement `.error` and `.warn` methods.

### Log collection not found

- If using `singleCollection: false`, logs are stored in `log_histories_{modelName}`.
- If using `singleCollection: true`, logs are stored in `log_histories`.

---

## License

MIT © [Granite Bagas](https://github.com/granitebps)
