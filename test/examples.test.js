'use strict';

var assert = require('assert');
var co = require('co');
var lookup = require('../');
var monogram = require('monogram');

describe('lookUp()', function() {
  it('works', function(done) {
    co(function*() {
      let db = yield monogram('mongodb://localhost:27017');
      let schema = new monogram.Schema({});

      lookup(schema);

      let Band = db.model({ schema: schema, collection: 'band' });
      let Person = db.model('people');

      yield Band.deleteMany({});
      yield Person.deleteMany({});

      let gnr = new Band({ _id: 1, name: `Guns N' Roses` });
      yield gnr.$save();

      yield Person.create([
        {
          name: 'Axl Rose',
          role: 'Lead Singer',
          band: gnr._id
        },
        {
          name: 'Slash',
          role: 'Guitarist',
          band: gnr._id
        }
      ]);

      let populated = yield Band.findOne({ _id: gnr._id }).
        lookUp(Person, 'members', { band: '$_id' });

      assert.equal(populated.members.length, 2);
      assert.equal(populated.members[0].name, 'Axl Rose');
      assert.equal(populated.members[1].name, 'Slash');

      done();
    }).catch(function(error) {
      done(error);
    });
  });
});
