'use strict';

var assert = require('assert');
var co = require('co');
var lookup = require('../');
var monogram = require('monogram');

describe('lookUp()', function() {
  let Band;
  let Person;

  before(function(done) {
    co(function*() {
      let db = yield monogram('mongodb://localhost:27017');

      let schema = new monogram.Schema({});

      lookup(schema);

      Band = db.model({ schema: schema, collection: 'band' });
      Person = db.model('people');

      yield Band.deleteMany({});
      yield Person.deleteMany({});

      done();
    }).catch(function(error) {
      done(error);
    });
  });

  it('works', function(done) {
    co(function*() {
      let db = yield monogram('mongodb://localhost:27017');
      let schema = new monogram.Schema({});

      lookup(schema);

      let Band = db.model({ schema: schema, collection: 'band' });
      let Person = db.model('people');

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

  it('properly ignores changes to populated docs', function(done) {
    co(function*() {
      let populated = yield Band.findOne({ name: `Guns N' Roses` }).
        lookUp(Person, 'members', { band: '$_id' });

      assert.equal(populated.members.length, 2);
      assert.equal(populated.members[1].name, 'Slash');

      populated.members[1].name = 'Buckethead';

      assert.deepEqual(populated.$delta(), { $set: {}, $unset: {} });

      yield populated.$save();

      let res = yield Band.findOne({ name: `Guns N' Roses` });
      assert.ok(!res.members);

      done();
    }).catch(function(error) {
      done(error);
    });
  });
});
