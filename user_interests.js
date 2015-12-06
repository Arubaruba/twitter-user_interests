Router.route('/login', function () {
    this.render('login');
});

Router.route('/', function () {
    this.layout('user_interests');
    this.render('message', {data: {message: 'Search for a user to get started'}});
});

Router.route('/user/:screenName', function () {
    var screenName = this.params.screenName;
    this.layout('user_interests');
    var self = this;

    async.parallel({
        userData: function (callback) {
            // Try to get users' data by screen name
            Meteor.call('getUser', screenName, callback);
        },
        interestData: function (callback) {
            // Try to get users' data by screen name
            Meteor.call('getInterests', screenName, callback);
        }
    }, function (err, results) {
        if (err) {
            self.render('message', {data: {message: 'User data for user \"' + screenName + '\" couldn\'t be retrieved.'}});
        } else if (results.interestData.topPositiveWords.length == 0 && results.interestData.topNegativeWords.length == 0) {
            self.render('message', {data: {message: 'No data for user \"' + screenName + '\". Are you sure this account has tweets?'}});
        } else {
            function addLinkToInterest(interest) {
                interest.link = 'https://twitter.com/search?f=tweets&q=' + encodeURIComponent(interest.term) + '%20from%3A' + encodeURIComponent(screenName) + '&src=typd';
                return interest;
            }

            self.render('search_found_user', {
                data: {
                    userName: results.userData.data.name,
                    profileImage: results.userData.data.profile_image_url.replace('_normal', '_400x400'),
                    profileLink: 'https://twitter.com/' + screenName,
                    positiveInterests: results.interestData.topPositiveWords.map(addLinkToInterest),
                    negativeInterests: results.interestData.topNegativeWords.map(addLinkToInterest),
                    screenName: screenName
                }
            });


        }
    });
    self.render('message', {data: {message: 'Getting user data for user \"' + screenName + '\"'}});
});

if (Meteor.isClient) {
    Session.setDefault('searchSuggestions', []);

    Template.user_interests.helpers({
        searchSuggestions: function () {
            return Session.get('searchSuggestions');
        }
    });

    Template.user_interests.events ({
        "click .go-button": function (target) {
            target.preventDefault();
            var screenName = $('.search-field').val();
            if (screenName) {
                Router.go('/user/' + screenName);
            } else {
                alert('Field cannot be empty!')
            }
        },
        "input .search-field": function () {
            var searchSuggestions = $('.search-suggestions');
            var searchValue = $('.search-field').val();
            Meteor.call('getUserQuerySuggestions', searchValue, function (err, results) {
                Session.set('searchSuggestions', results.map(function (result) {
                    return {name: result.name, href: '/user/' + result.screen_name};
                }));
            });
            if (searchValue != '') {
                searchSuggestions.show();
                searchSuggestions.focusin();
            } else {
                searchSuggestions.hide();
            }
        },
        //"blur .search-field": function () {
        //    $('.search-suggestions').hide();
        //},
        "focus .search-field": function () {
            $('.search-suggestions').show();
        }
    });
}

if (Meteor.isServer) {

    var twitter = new TwitterApi();
    var natural = Meteor.npmRequire('natural');
    var TfIdf = natural.TfIdf;
    var sentiment = Meteor.npmRequire('sentiment');
    //var wordnet = new natural.WordNet();
    //wordnet.lookup('gun', function (res) {
    //    console.log(res);
    //});

    Meteor.startup(function () {
        Accounts.loginServiceConfiguration.remove({
            service: 'twitter'
        });

        Accounts.loginServiceConfiguration.insert({
            service: 'twitter',
            consumerKey: TWITTER_CONSUMER_KEY,
            secret: TWITTER_SECRET
        });
    });

    var MAX_ITEMS_PER_CATEGORY = 10;
    var NUM_TWEETS_TO_SCAN = 30;
    var SUGGESTED_SEARCH_USERS = 4;

    Meteor.methods({
        getInterests: function (screenName) {
            var recentTweets = twitter.get('statuses/user_timeline.json', {
                screen_name: screenName,
                count: NUM_TWEETS_TO_SCAN
            });
            var tfidf = new TfIdf();

            var tweetText = recentTweets.data.map(function (tweet) {
                if (tweet.text) {
                    var matchQuoated = tweet.text.match(/^"(.+)"/m);
                    return (matchQuoated) ? matchQuoated[1] : tweet.text;
                }
            });

            var combinedTweetText = tweetText.reduce(function (acc, next) {
                return acc + ' ' + next;
            }, '');

            tfidf.addDocument(combinedTweetText);

            var wordImportance = tfidf.listTerms(0);

            var positiveWords = [];
            var negativeWords = [];

            tweetText.forEach(function (text) {
                var sentimentAnalysis = sentiment(text);
                positiveWords = positiveWords.concat(sentimentAnalysis.positive);
                negativeWords = negativeWords.concat(sentimentAnalysis.negative);
            });

            var topPositiveWords = [];
            var topNegativeWords = [];

            function numberOfOccurrences(s1, s2) {
                return (s2.length - s2.replace(new RegExp(s1, "g"), '').length) / s1.length;
            }

            function getSearchLink(term) {
                return 'https://twitter.com/search?f=tweets&q=' + encodeURIComponent(term) + '%20from%3' + encodeURIComponent(screenName) + '&src=typd';
            }

            wordImportance.forEach(function (importance) {
                if (topPositiveWords.length < MAX_ITEMS_PER_CATEGORY && positiveWords.indexOf(importance.term) != -1) {
                    topPositiveWords.push({
                        occurrences: numberOfOccurrences(importance.term, combinedTweetText),
                        term: importance.term,
                        searchLink: getSearchLink(importance.term)
                    });
                }

                if (topNegativeWords.length < MAX_ITEMS_PER_CATEGORY && negativeWords.indexOf(importance.term) != -1) {
                    topNegativeWords.push({
                        occurrences: numberOfOccurrences(importance.term, combinedTweetText),
                        term: importance.term,
                        searchLink: getSearchLink(importance.term)
                    });
                }
            });

            return {topPositiveWords: topPositiveWords, topNegativeWords: topNegativeWords};
        },
        getUser: function (screenName) {
            return twitter.get('users/show.json', {screen_name: screenName});
        },
        getUserQuerySuggestions: function (query) {
            // We need to log in with twitter to search users
            return twitter.get('users/search.json', {q: query, count: SUGGESTED_SEARCH_USERS}).data;
        }
    })
}
