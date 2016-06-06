'use strict';
module.exports = function(grunt) {
    var cd = null;

    function getCorbelDriver(env) {
        if (!cd) {
            env = env || 'next';
            var configFile = grunt.file.readJSON('gruntconfig.json'),
                corbelEnvUrl;
            if (env === 'production') {
                corbelEnvUrl = '';
            } else if (env === 'mvp') {
                corbelEnvUrl = '-current';
            } else {
                corbelEnvUrl = '-' + env;
            }
            grunt.log.oklns('Get Corbel Driver in enviroment = ' + env);

            var corbel = require('../node_modules/corbel-js/dist/corbel.js');

            var options = {
                'clientId': configFile['corbelAdminClientId_' + env],
                'clientSecret': configFile['corbelAdminSecret_' + env],
                //'audience': 'http://iam.bqws.io',
                'urlBase': 'https://{{module}}' + corbelEnvUrl + '.bqws.io/v1.0/'
                    //'scopes': ['bitbloq:web', 'bitbloq:user', 'bitbloq:admin']
            };

            cd = corbel.getDriver(options);
        }
        return cd;
    }

    function getAdminToken(env) {
        var cd = getCorbelDriver(env),
            configFile = grunt.file.readJSON('gruntconfig.json');
        grunt.log.oklns('Get Corbel Admin Token');
        return cd.iam.token().create({
            claims: {
                'basic_auth.username': configFile['corbelAdminUsername_' + env],
                'basic_auth.password': configFile['corbelAdminPassword_' + env]
            }
        });
    }

    grunt.task.registerTask('searchBloq', 'search bloq on corbel', function(bloqName, env) {

        var done = this.async();
        env = env || 'next';
        bloqName = bloqName || 'stringArrayAdvanced';
        //bloqName = 'stringArrayAdvanced';
        //numberArrayAdvanced

        getAdminToken(env).then(function(response) {
            grunt.log.writeln('Getting Collection');
            cd.resources.collection('bitbloq:Bloqs')
                .page(0)
                .pageSize(5)
                .get({
                    query: [{
                        '$eq': {
                            'name': bloqName
                        }
                    }]
                }).then(function(response) {
                    grunt.log.writeln(response.data.length);
                    console.log(response.data[0].id);
                    console.log(response.data[0].name);
                    console.log(response.data[0].code);
                    done();
                }).catch(function(error) {
                    console.log('error');
                    console.log(error);
                    done(error);
                });
        }).catch(function(err) {
            grunt.log.error('create token error');
            done(err);
        });
    });

    //grunt updateBloq:next && grunt searchBloq:stringArrayAdvanced:next && grunt searchBloq:numberArrayAdvanced:next && grunt searchBloq:declareVariable:next
    //grunt updateBloq:production && grunt searchBloq:stringArrayAdvanced:production && grunt searchBloq:numberArrayAdvanced:production && grunt searchBloq:declareVariable:production
    grunt.task.registerTask('updateBloq', 'update bloq on corbel', function(env) {
        var done = this.async(),
            bloqId1 = '',
            bloqId2 = '';
        switch (env) {
            case 'next':
                bloqId1 = 'bitbloqadmin:5b796c4b-d693-45ae-a250-5a0d3f14e09f';
                bloqId2 = 'bitbloqadmin:d348c721-36bc-46b8-961f-c27a3b9aba77';
                break;
            case 'production':
                bloqId1 = 'bitbloqadmin:f2aa4570-f072-40d9-a439-225c5aadffc5';
                bloqId2 = 'bitbloqadmin:e52301fd-4eaf-4508-a8b2-5952bea0ed70';
                break;
            default:
        }
        updateBloq(bloqId1, env, function() {
            updateBloq(bloqId2, env, done);
        });
    });

    function updateBloq(id, env, done) {
        //var codeToChange = 'hophop';
        var codeToChange = '({TYPE})malloc({VALUE}*sizeof({TYPE}.withoutAsterisk))';

        getAdminToken(env).then(function(response) {
            grunt.log.writeln('Getting Collection');

            cd.resources.resource('bitbloq:Bloqs', id).
            update({
                code: codeToChange
            }).
            then(function(response) {
                grunt.log.writeln(response.data.length);
                console.log(response.data);
                done();
            }).catch(function(error) {
                console.log('error');
                console.log(error);
                done(error);
            });
        }).catch(function(err) {
            grunt.log.error('create token error');
            done(err);
        });
    }

    var tempPageNumber = {};

    function getCorbelCollection(collectionName, env, timestamp, callback) {
        grunt.log.writeln('getCorbelCollection= ' + collectionName + ' on ' + env + ' pageNumber' + tempPageNumber[collectionName]);
        if (!tempPageNumber[collectionName]) {
            tempPageNumber[collectionName] = 0;
        }

        cd.resources.collection('bitbloq:' + collectionName)
            .page(tempPageNumber[collectionName])
            .pageSize(50)
            .get().then(function(response) {
                grunt.log.writeln(collectionName);
                grunt.log.writeln(response.data.length);
                if (response.data.length === 0) {
                    // if (tempPageNumber[collectionName] <= 500) {
                    //     //read all files
                    //     var allItems = [];
                    //     for (var i = 0; i < tempPageNumber[collectionName]; i++) {
                    //         allItems = allItems.concat(grunt.file.readJSON('./backupsDB/' + timestamp + '/' + collectionName + '_' + i + '.json'));
                    //     }
                    //     tempPageNumber[collectionName] = undefined;
                    //     console.log('total', allItems.length);
                    //     callback(null, allItems);
                    // } else {
                    callback(null, [-1]);
                    //}
                } else {
                    grunt.file.write('./backupsDB/' + timestamp + '/' + collectionName + '_' + tempPageNumber[collectionName] + '.json', JSON.stringify(response.data));
                    tempPageNumber[collectionName] = tempPageNumber[collectionName] + 1;
                    getCorbelCollection(collectionName, env, timestamp, callback);
                }

            }).catch(function(error) {
                console.log('error');
                console.log(error);
                callback(error);
            });

    }

    grunt.registerTask('exportCollectionFromCorbel', function(collectionName, env, timestamp) {
        var done = this.async();
        getAdminToken(env).then(function(response) {
            switch (collectionName) {
                case 'project':
                    migrateProjectsFromCorbelToBitbloq(env, timestamp, done);
                    break;
                case 'user':
                    migrateUsersFromCorbelToBitbloq(timestamp, done);
                    break;
                case 'forum':
                    migrateForumFromCorbelToBitbloq(env, timestamp, done);
                    break;
                default:
                    console.log('Unknow Collection, nothing to do  ¯\\_(ツ)_/¯');
                    done();
            }
        }).catch(function(err) {
            grunt.log.error('create token error');
            done(err);
        });

    });

    function migrateProjectsFromCorbelToBitbloq(env, timestamp, callback) {
        var async = require('async');
        async.parallel([
            getCorbelCollection.bind(null, 'Angularproject', env, timestamp),
            getCorbelCollection.bind(null, 'ProjectStats', env, timestamp)
        ], function(err, result) {
            if (err) {
                console.log('err');
                callback(err);
            } else {
                console.log('ok');
                console.log(result[1].length);

                var projects,
                    stats = [];
                for (var i = 0; i < tempPageNumber['ProjectStats']; i++) {
                    stats = stats.concat(grunt.file.readJSON('./backupsDB/' + timestamp + '/ProjectStats_' + i + '.json'));
                }
                console.log('tempPageNumber[ngularproject]', tempPageNumber['Angularproject']);
                for (var i = 0; i < tempPageNumber['Angularproject']; i++) {
                    console.log('process', i);
                    projects = grunt.file.readJSON('./backupsDB/' + timestamp + '/Angularproject_' + i + '.json')

                    processProjects(projects, stats);
                    grunt.file.write('./backupsDB/' + timestamp + '/Angularproject_' + i + '.json', JSON.stringify(projects));
                }
                grunt.file.write('./backupsDB/' + timestamp + '/Angularproject_tempPageNumber.txt', tempPageNumber['Angularproject']);
                callback();
            }
        });
    }

    function processProjects(projects, stats) {
        var tempStat,
            _ = require('lodash');
        for (var i = 0; i < projects.length; i++) {
            tempStat = _.find(stats, ['id', projects[i].id]);
            if (tempStat) {
                projects[i].timesViewed = tempStat.timesViewed;
                projects[i].timesAdded = tempStat.timesAdded;
            }

            projects[i].corbelId = projects[i].id;
            projects[i].createdAt = projects[i]._createdAt;
            projects[i].updatedAt = projects[i]._updatedAt;

            delete projects[i].id;
            delete projects[i].creatorUsername;
            delete projects[i].links;
            delete projects[i].imageType;
            delete projects[i]._createdAt;
            delete projects[i]._updatedAt;
        }
    }

    function parseFalse(value) {
        return !(!value || (value === 'false'));
    }

    function migrateUsersFromCorbelToBitbloq(timestamp, callback) {
        var users = grunt.file.readJSON('./backupsDB/user_iam.json'),
            identities = grunt.file.readJSON('./backupsDB/identity.json'),
            finalUsers = [],
            duplicatedUsername = [],
            usernames = {},
            _ = require('lodash'),
            found, k, identity;
        console.log('We have users, now transform it to Bitbloq and save on backupsDB', timestamp, users.length);
        for (var i = 0; i < users.length; i++) {
            users[i]._id = users[i]._id.$oid;
            if (!usernames[users[i].username.toLowerCase()]) {
                usernames[users[i].username.toLowerCase()] = true;
            } else {
                console.log('duplicated Username');
                duplicatedUsername.push(users[i]);
                while (usernames[users[i].username.toLowerCase()]) {
                    users[i].username = users[i].username + (Math.random() * 6);
                }
                usernames[users[i].username.toLowerCase()] = true;
            }

            if (users[i].email && (users[i]._id !== 'bitbloqadmin')) {

                users[i].birthday = users[i]['properties.birthday'];
                users[i].cookiePolicyAccepted = false;
                users[i].hasBeenWarnedAboutChangeBloqsToCode = false;
                users[i].hasBeenAskedIfTeacher = parseFalse(users[i].properties.hasBeenAskedIfTeacher);
                users[i].takeTour = parseFalse(users[i].properties.tour);
                users[i].language = users[i].properties.language;
                users[i].newsletter = parseFalse(users[i].properties.newsletter);
                users[i].role = 'user';
                users[i].corbelHash = true;

                /*if (users[i].createdDate) {
                    users[i].createdAt = users[i].createdDate.$date;
                }
*/
                users[i].bannedInForum = false;
                var deleteFields = ['id', 'scopes', 'createdBy', 'domain', 'groups', '_createdAt', '_updatedAt', 'createdDate',
                    'properties.hasBeenAskedIfTeacher', 'properties.birthday', 'properties.code', 'properties.language', 'properties.cookiePolicyAccepted', 'properties.connected',
                    'properties.tour', 'properties.term', 'properties.remindSupportModal', 'properties.isTeacher', 'properties.newsletter', 'properties.imageType'
                ];

                for (var j = 0; j < deleteFields.length; j++) {
                    delete users[i][deleteFields[j]]
                }
                found = false;
                k = 0;
                identity = _.find(identities, function(item) {
                    return item.userId === users[i]._id;
                });
                if (identity && (identity.oauthService !== 'silkroad')) {
                    //console.log('identity found')
                    users[i].social = {};
                    users[i].social[identity.oauthService] = {
                        id: identity.oauthId
                    };
                }

                /*while (!found && (k < identities.length)) {
                    if (identities[k].userId === users[i]._id) {
                        console.log('found!');
                        users[i].social = {};
                        users[i].social[identities[k].oauthService] = {
                            oauthId: identities[k].oauthId
                        }
                        found = true;
                    } else {
                        k++;
                    }
                }*/
                // if (!users[i].salt || !users[i].password) {
                //     users[i].salt = timestamp + i + (Math.random() * 6);
                //     users[i].password = timestamp + i + (Math.random() * 6);
                // }
                finalUsers.push(users[i]);

            } else {
                console.log('wrongUser', users[i]);
            }

        }
        console.log('duplicated', duplicatedUsername.length);
        grunt.file.write('./backupsDB/' + timestamp + '/user.json', JSON.stringify(finalUsers));
        grunt.file.write('./backupsDB/' + timestamp + '/duplicatedUsername.json', JSON.stringify(duplicatedUsername));
        callback();

    }

    function migrateForumFromCorbelToBitbloq(env, timestamp, callback) {
        var async = require('async'),
            _ = require('lodash');
        async.parallel([
            getCorbelCollection.bind(null, 'ForumAnswers', env),
            //getCorbelCollection.bind(null, 'ForumCategories', env),
            getCorbelCollection.bind(null, 'ForumStats', env),
            getCorbelCollection.bind(null, 'ForumThemes', env)
        ], function(err, result) {
            if (err) {
                console.log('err');
                callback(err);
            } else {
                console.log('ok');
                console.log(result[0].length);
                console.log(result[1].length);
                console.log(result[2].length);
                //console.log(result[3].length);

                var threads,
                    stats,
                    answers;

                for (var i = 0; i < tempPageNumber['ForumStats']; i++) {
                    stats = stats.concat(grunt.file.readJSON('./backupsDB/' + timestamp + '/ForumStats_' + i + '.json'));
                }
                console.log('tempPageNumber[ForumThemes]', tempPageNumber['ForumThemes']);
                for (var i = 0; i < tempPageNumber['ForumThemes']; i++) {
                    console.log('process', i);
                    threads = grunt.file.readJSON('./backupsDB/' + timestamp + '/ForumThemes_' + i + '.json')

                    processThreads(threads, stats);
                    grunt.file.write('./backupsDB/' + timestamp + '/ForumThemes_' + i + '.json', JSON.stringify(threads));
                }
                grunt.file.write('./backupsDB/' + timestamp + '/ForumThemes_tempPageNumber.txt', tempPageNumber['ForumThemes']);

                console.log('tempPageNumber[ForumAnswers]', tempPageNumber['ForumAnswers']);
                for (var i = 0; i < tempPageNumber['ForumAnswers']; i++) {
                    console.log('process', i);
                    answers = grunt.file.readJSON('./backupsDB/' + timestamp + '/ForumAnswers_' + i + '.json')

                    processAnswers(answers, stats);
                    grunt.file.write('./backupsDB/' + timestamp + '/ForumAnswers_' + i + '.json', JSON.stringify(answers));
                }
                grunt.file.write('./backupsDB/' + timestamp + '/ForumAnswers_tempPageNumber.txt', tempPageNumber['ForumAnswers']);
                callback();
            }
        });
    };

    //TODO
    function processThreads(threads, stats) {
        var tempStat,
            _ = require('lodash');
        for (var i = 0; i < projects.length; i++) {
            tempStat = _.find(stats, ['id', threads[i].id]);
            if (tempStat) {
                threads[i].timesViewed = tempStat.timesViewed;
                threads[i].timesAdded = tempStat.timesAdded;
            }

            threads[i].corbelId = threads[i].id;
            threads[i].createdAt = threads[i]._createdAt;
            threads[i].updatedAt = threads[i]._updatedAt;

            delete threads[i].id;
            delete threads[i].creatorUsername;
            delete threads[i].links;
            delete threads[i].imageType;
            delete threads[i]._createdAt;
            delete threads[i]._updatedAt;
        }
    }

    // grunt importCollectionsFromCorbel:next:qa
    grunt.registerTask('importCollectionsFromCorbel', function(corbelEnv, backEnv) {
        var fs = require('fs'),
            timestamp = 1464279964116; //Date.now();
        //fs.mkdirSync('./backupsDB/' + timestamp);
        grunt.task.run([
            //'exportCollectionFromCorbel:project:' + corbelEnv + ':' + timestamp,
            //'importProjectFromCorbel:' + timestamp,
            //'exportCollectionFromCorbel:user:' + corbelEnv + ':' + timestamp,
            'importUsersFromCorbel:' + timestamp
        ]);
    });

};