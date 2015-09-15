'use strict';

var _ = require('lodash');
var debug = require('debug')('monogram:lookup:debug');

module.exports = function(schema) {
  var storageKey = Symbol();

  schema.method('query', 'lookUp', function(model, as, on, options) {
    this[storageKey] = this[storageKey] || [];
    this[storageKey].push({ model: model, as: as, on: on, options: options });
    debug('Number of lookups: ' + this[storageKey].length);
    return this;
  });

  var exec = function*(next) {
    var docs = yield next;
    if (!this[storageKey]) {
      debug('No ops for lookup');
      return docs;
    }

    var toExec = [];
    this[storageKey].forEach(function(op) {
      if (Array.isArray(docs)) {
        docs.forEach(function(doc) {
          debug('lookup for doc', doc);
          toExec.push(op.model.find(transformQuery(op.on, doc)).
            then(function(res) {
              _.set(doc, op.as, res);
            }));
        });
      } else {
        debug('lookup for doc', docs);
        toExec.push(op.model.find(transformQuery(op.on, docs)).
          then(function(res) {
            _.set(docs, op.as, res);
          }));
      }
    });

    yield toExec;

    debug('docs after lookup', docs);
    return docs;
  };

  schema.
    middleware('find', exec).
    middleware('findOne', exec).
    middleware('findOneAndUpdate', exec).
    middleware('findOneAndReplace', exec);
};

function transformQuery(query, doc) {
  query = _.cloneDeep(query);
  visitor(query, function(v, key, obj) {
    if (typeof v === 'string' && v.charAt(0) === '$') {
      obj[key] = _.get(doc, v.substr(1));
    }
  });

  return query;
}

function visitor(obj, fn) {
  visitObject(obj, fn, '');
}

function visitArray(arr, fn, path) {
  arr.forEach(function(v, index) {
    if (Array.isArray(v)) {
      visitArray(v, fn, join(path, index.toString()));
    } else if (typeof value === 'object') {
      visitObject(v, fn, join(path, index.toString()));
    } else {
      fn(value, index.toString(), arr);
    }
  });
}

function visitObject(obj, fn, path) {
  _.each(obj, function(value, key) {
    if (Array.isArray(value)) {
      visitArray(value, fn, join(path, key));
    } else if (typeof value === 'object') {
      visitObject(value, fn, join(path, key));
    } else {
      fn(value, key, obj);
    }
  });
}

function join(path, key) {
  if (path) {
    return path + '.' + key;
  }
  return key;
}
