'use strict';

var _ = require('lodash');
var q = require('q');

var mongoose = require('mongoose');
var ObjectId = mongoose.Types.ObjectId;

var TaskModel = require('../models/task.js');
var TaskArchiveModel = mongoose.model('task_archive');

var ProjectModel = require('../models/project.js');
var ProjectArchiveModel = mongoose.model('project_archive');

var DiscussionModel = require('../models/discussion.js');
var DiscussionArchiveModel = mongoose.model('discussion_archive');

var UpdateModel = require('../models/update.js');
var UpdateArchiveModel = mongoose.model('update_archive');

var UserModel = require('../models/user.js');

var AttachementModel = require('../models/attachment.js');
var AttachementArchiveModel = mongoose.model('attachment_archive');

var entityNameMap = {
  'tasks': {
    mainModel: TaskModel,
    archiveModel: TaskArchiveModel,
    name: 'Task'
  },
  'projects': {
    mainModel: ProjectModel,
    archiveModel: ProjectArchiveModel,
    name: 'Project'
  },
  'discussions': {
    mainModel: DiscussionModel,
    archiveModel: DiscussionArchiveModel,
    name: 'Discussion'
  },
  'updates': {
    mainModel: UpdateModel,
    archiveModel: UpdateArchiveModel,
    name: 'Update'
  },
  'users': {
    mainModel: UserModel,
    name: 'User'
  },
  'attachments': {
    mainModel: AttachementModel,
    archiveModel: AttachementArchiveModel,
    name: 'Attachement'
  }

};

var defaults = {
  defaults: {},
  includes: ''
};

module.exports = function(entityName, options) {
  var findByUser = ['tasks', 'projects', 'discussions'];
  if (findByUser.indexOf(entityName) > -1)
    var currentUser = true;

  var Model = entityNameMap[entityName].mainModel;
  var ArchiveModel = entityNameMap[entityName].archiveModel;

  if (_.isEmpty(options)) {
    options = {};
  }

  options = _.defaults(options, defaults);

  function all(pagination, acl) {
    var deffered = q.defer();

    var countQuery = Model.find().count();
    var mergedPromise;
    var query = acl.query(entityNameMap[entityName].name);

    if (pagination && pagination.type) {
      if (pagination.type === 'page') {
        query.find({})
          .sort(pagination.sort)
          .skip(pagination.start)
          .limit(pagination.limit);

        query.populate(options.includes);
        query.hint({
          _id: 1
        });

        mergedPromise = q.all([query, countQuery]).then(function(results) {
          pagination.count = results[1];
          return results[0];
        });

        deffered.resolve(mergedPromise);
      }
    } else {

      query.find({});
      query.populate(options.includes);
      query.hint({
        _id: 1
      });

      deffered.resolve(query);
    }

    return deffered.promise;
  }

  function read(id, acl) {
    var conditions = {
      _id: id
    };
    if (currentUser) conditions['circles.c19n'] = {
      $in: acl.user.allowed.c19n
    }
    var query = Model.find(conditions);
    query.populate(options.includes);

    return query.then(function(results) {
      if (!results.length) {
        throw new Error('Entity not found');
      }

      return results[0];
    });
  }

  function create(entity, user) {
    entity.created = new Date();
    entity.updated = new Date();
    entity.creator = user.user._id;
    if (!entity.circles) entity.circles = {};
    if (!entity.circles.c19n) entity.circles.c19n = user.user.circles.c19n;

    return new Model(entity).save(user).then(function(e) {
      return Model.populate(e, options.includes);
    });
  }

  function update(oldE, newE, user) {

    var entityWithDefaults = _.defaults(newE, options.defaults);

    oldE = _.extend(oldE, entityWithDefaults);

    oldE.updated = new Date();
    oldE.updater = user.user._id;
    return oldE.save(user).then(function(data) {
      return Model.populate(data, options.includes);
    });
  }


  function destroy(entity, user) {
    return entity.remove(user);
  }

  function readHistory(id) {
    var Query = ArchiveModel.find({
      'c._id': new ObjectId(id)
    });

    Query.populate('u');

    return Query.exec();
  }

  var methods = {
    all: all,
    create: create,
    read: read,
    update: update,
    destroy: destroy
  };

  if (ArchiveModel) {
    methods.readHistory = readHistory;
  }

  return methods;
};