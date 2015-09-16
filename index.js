'use strict';

var _ = require('lodash');
var debug = require('debug')('monogram:lookup:debug');

module.exports = function(schema) {
  var storageKey = Symbol();

  schema.method('query', 'lookUp', function(path, model, filter, options) {
    this[storageKey] = this[storageKey] || [];

    let op = { path: path, model: model, filter: filter, options: options };
    if (this.s.schema && this.s.schema._paths[path]) {
      _.defaults(op, this.s.schema._paths[path].$lookUp);
    }
    this[storageKey].push(op);
    debug('Number of lookups: ' + this[storageKey].length);
    return this;
  });

  schema.method('document', '$lookUp', function*(path, model, filter, options) {
    var chain = new Chain(this, storageKey, getPromise);
    chain[storageKey] = [{
      path: path,
      model: model,
      filter: filter,
      options: options
    }];
    return chain;
  });

  var getPromise = function(docs) {
    if (!this[storageKey]) {
      debug('No ops for lookup');
      return;
    }

    var toExec = [];
    this[storageKey].forEach(function(op) {
      if (Array.isArray(docs)) {
        docs.forEach(function(doc) {
          debug('lookup for doc', doc);
          toExec.push(op.model.find(transformQuery(op.filter, doc), op.options).
            then(function(res) {
              doc.$ignorePath(op.path, true);
              _.set(doc, op.path, res);
            }));
        });
      } else {
        debug('lookup for doc', docs);
        toExec.push(op.model.find(transformQuery(op.filter, docs), op.options).
          then(function(res) {
            docs.$ignorePath(op.path, true);
            _.set(docs, op.path, res);
          }));
      }
    });

    return toExec;
  };

  var exec = function*(next) {
    var docs = yield next;

    var toExec = getPromise.call(this, docs);
    if (!toExec) {
      debug('No ops for lookup');
      return docs;
    }

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

function Chain(doc, storageKey, exec) {
  this.$lookUp = (model, as, on, options) => {
    this[storageKey].push({ model: model, as: as, on: on, options: options });
  };
  this.then = function(resolve, reject) {
    return Promise.all(exec.call(this, doc)).then(resolve, reject);
  };
}

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
