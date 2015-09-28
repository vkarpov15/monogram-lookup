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
      Person = db.model({ collection: 'people' });

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
      let Person = db.model({ collection: 'people' });

      let gnr = new Band({ _id: 1, name: `Guns N' Roses` });
      yield gnr.$save();

      yield Person.insertMany([
        {
          _id: 1,
          name: 'Axl Rose',
          role: 'Lead Singer',
          band: gnr._id
        },
        {
          _id: 2,
          name: 'Slash',
          role: 'Guitarist',
          band: gnr._id
        }
      ]);

      let populated = yield Band.findOne({ _id: gnr._id }).
        lookUp('members', Person, { band: '$_id' });

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
        lookUp('members', Person, { band: '$_id' });

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

  it('works with findOneAndUpdate', function(done) {
    co(function*() {
      let setOp = { $set: { founded: '1985' } };
      let gnr = yield Band.
        findOneAndUpdate({ name: `Guns N' Roses` }, setOp).
        lookUp('members', Person, { band: '$_id' });

      assert.equal(gnr.members.length, 2);
      assert.equal(gnr.members[0].name, 'Axl Rose');
      assert.equal(gnr.members[1].name, 'Slash');

      done();
    }).catch(function(error) {
      done(error);
    });
  });

  it('works with find', function(done) {
    co(function*() {
      let setOp = { $set: { founded: '1985' } };
      let bands = yield Band.
        find({ name: `Guns N' Roses` }).
        lookUp('members', Person, { band: '$_id' });

      assert.equal(bands.length, 1);
      assert.equal(bands[0].members.length, 2);
      assert.equal(bands[0].members[0].name, 'Axl Rose');
      assert.equal(bands[0].members[1].name, 'Slash');

      done();
    }).catch(function(error) {
      done(error);
    });
  });

  it('$lookUp on a document', function(done) {
    co(function*() {
      let gnr = yield Band.findOne({ name: `Guns N' Roses` });

      assert.ok(!gnr.members);

      let leadLookup = { band: '$_id', role: 'Lead Singer' };
      yield gnr.$lookUp('members', Person, { band: '$_id' }).
        $lookUp('lead', Person, leadLookup, { justOne: true });

      assert.equal(gnr.members.length, 2);
      assert.equal(gnr.members[0].name, 'Axl Rose');
      assert.equal(gnr.members[1].name, 'Slash');

      assert.equal(gnr.lead.name, 'Axl Rose');

      done();
    }).catch(function(error) {
      done(error);
    });
  });

  it('in schema', function(done) {
    co(function*() {
      let db = yield monogram('mongodb://localhost:27017');
      let Person = db.model('Person', { collection: 'people' });
      let schema = new monogram.Schema({
        members: {
          $lookUp: { ref: 'Person', filter: { band: '$_id' } }
        }
      });

      lookup(schema);

      let Band = db.model({ schema: schema, collection: 'band' });

      let gnr = new Band({ _id: 2, name: `Guns N' Roses` });
      yield gnr.$save();

      yield Person.insertMany([
        {
          _id: 1,
          name: 'Axl Rose',
          role: 'Lead Singer',
          band: gnr._id
        },
        {
          _id: 2,
          name: 'Slash',
          role: 'Guitarist',
          band: gnr._id
        }
      ]);

      yield gnr.$lookUp('members');

      assert.equal(gnr.members.length, 2);
      assert.equal(gnr.members[0].name, 'Axl Rose');
      assert.equal(gnr.members[1].name, 'Slash');

      let populated = yield Band.findOne({ _id: gnr._id }).
        lookUp('members');

      assert.equal(populated.members.length, 2);
      assert.equal(populated.members[0].name, 'Axl Rose');
      assert.equal(populated.members[1].name, 'Slash');

      done();
    }).catch(function(error) {
      done(error);
    });
  });

  describe('complex queries', function() {
    beforeEach(function(done) {
      co(function*() {
        yield Band.deleteMany({});
        yield Person.deleteMany({});
        done();
      }).catch(function(error) {
        done(error);
      });
    });

    it('$or to aggregate inconsistent schemas', function(done) {
      co(function*() {
        yield Band.insertMany([{
          name: 'Mötley Crüe',
          members: ['Nikki Sixx', 'Tommy Lee']
        }]);

        yield Person.insertMany([
          { _id: 'Nikki Sixx', role: 'Bassist' },
          { _id: 'Tommy Lee', role: 'Drummer' },
          { _id: 'Vince Neil', band: 'Mötley Crüe', role: 'Lead Singer' }
        ]);

        let crue = yield Band.
          findOne({ name: 'Mötley Crüe' }).
          lookUp('members', Person,
            { $or: [{ _id: { $in: '$members' } }, { band: '$name' }] },
            { sort: { _id: 1 } });

        assert.equal(crue.members.length, 3);
        assert.equal(crue.members[0]._id, 'Nikki Sixx');
        assert.equal(crue.members[1]._id, 'Tommy Lee');
        assert.equal(crue.members[2]._id, 'Vince Neil');

        done();
      }).catch(function(error) {
        done(error);
      });
    });

    it('$in for multiple field names', function(done) {
      co(function*() {
        yield Band.insertMany([{
          name: 'Mötley Crüe',
          utf8Name: 'Motley Crue'
        }]);

        yield Person.insertMany([
          { _id: 'Nikki Sixx', band: 'Mötley Crüe' },
          { _id: 'Tommy Lee', band: 'Motley Crue' }, // Woops, no umlauts
          { _id: 'Vince Neil', band: 'Mötley Crüe', role: 'Lead Singer' }
        ]);

        let crue = yield Band.
          findOne({ name: 'Mötley Crüe' }).
          lookUp('members', Person,
            { band: { $in: ['$name', '$utf8Name'] } },
            { sort: { _id: 1 } });

        assert.equal(crue.members.length, 3);
        assert.equal(crue.members[0]._id, 'Nikki Sixx');
        assert.equal(crue.members[1]._id, 'Tommy Lee');
        assert.equal(crue.members[2]._id, 'Vince Neil');

        done();
      }).catch(function(error) {
        done(error);
      });
    });
  });
});
