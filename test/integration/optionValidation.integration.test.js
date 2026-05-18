const mongoose = require('mongoose');
const { changeLoggingPlugin } = require('../../dist');

describe('mongoose-log-history plugin - Option Validation', () => {
  it('throws if modelName is missing or not a string', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        trackedFields: [{ value: 'status' }],
      });
    }).toThrow(/modelName/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 123,
        trackedFields: [{ value: 'status' }],
      });
    }).toThrow(/modelName/);
  });

  it('throws if trackedFields is missing or not an array', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
      });
    }).toThrow(/trackedFields/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: 'status',
      });
    }).toThrow(/trackedFields/);
  });

  it('throws if batchSize or maxBatchLog is not a positive integer', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        batchSize: 0,
      });
    }).toThrow(/batchSize/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        maxBatchLog: -1,
      });
    }).toThrow(/maxBatchLog/);
  });

  it('throws if logger does not have error and warn methods', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        logger: {},
      });
    }).toThrow(/logger/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        logger: { error: () => {} },
      });
    }).toThrow(/logger/);
  });

  it('throws if softDelete config is invalid', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        softDelete: 'not-an-object',
      });
    }).toThrow(/softDelete/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        softDelete: { field: 123, value: 'deleted' },
      });
    }).toThrow(/softDelete/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        softDelete: { field: 'status' },
      });
    }).toThrow(/softDelete/);
  });

  it('throws if contextFields (plugin-level) is not an array', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        contextFields: 'user.name',
      });
    }).toThrow(/contextFields/);
  });

  it('throws if trackedFields[].contextFields is not array or object', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status', contextFields: 123 }],
      });
    }).toThrow(/contextFields/);
  });

  it('throws if trackedFields[].trackedFields is not an array', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status', trackedFields: 'not-an-array' }],
      });
    }).toThrow(/trackedFields/);
  });

  it('throws if singleCollection or saveWholeDoc is not a boolean', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        singleCollection: 'yes',
      });
    }).toThrow(/singleCollection/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        saveWholeDoc: 'no',
      });
    }).toThrow(/saveWholeDoc/);
  });

  it('throws if modelKeyId is not a string', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status' }],
        modelKeyId: 123,
      });
    }).toThrow(/modelKeyId/);
  });

  it('throws if maskedValue config is invalid', () => {
    const schema = new mongoose.Schema({ status: String });
    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status', maskedValue: true }],
      });
    }).toThrow(/masked/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status', maskedValue: new Date() }],
      });
    }).toThrow(/masked/);

    expect(() => {
      schema.plugin(changeLoggingPlugin, {
        modelName: 'Order',
        trackedFields: [{ value: 'status', maskedValue: { invalid: true } }],
      });
    }).toThrow(/masked/);
  });
});
