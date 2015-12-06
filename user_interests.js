Router.route('/', function () {
    this.render('login');
});

Router.route('/users', function () {
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
        } else {
            console.log(JSON.stringify(results.interestData));
            self.render('search_found_user', {
                data: {
                    userName: results.userData.data.name,
                    profileImage: results.userData.data.profile_image_url.replace('_normal', '_400x400'),
                    profileLink: 'https://twitter.com/' + screenName,
                    positiveInterests: results.interestData.topPositiveWords,
                    negativeInterests: results.interestData.topNegativeWords
                }
            });
        }
    });
    self.render('message', {data: {message: 'Getting user data for user \"' + screenName + '\"'}});
});

if (Meteor.isClient) {
    Template.user_interests.events ({
        "click .go-button": function (target) {
            target.preventDefault();
            var screenName = $('.search-field').val();
            if (screenName) {
                Router.go('/user/' + screenName);
            } else {
                alert('Field cannot be empty!')
            }
        }
    });

    Template.user_interests.helpers({
        searchUserNameInput: function () {
            return Session.get('searchUserNameInput');
        }
    });
}

if (Meteor.isServer) {

    var twitter = new TwitterApi();
    var natural = Meteor.npmRequire('natural');
    var TfIdf = natural.TfIdf;
    var sentiment = Meteor.npmRequire('sentiment');

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

    var MAX_ITEMS_PER_CATEGORY = 5;

    Meteor.methods({
        getInterests: function (screenName) {
            var recentTweets = twitter.get('statuses/user_timeline.json', {screen_name: screenName, count: 20});
            var tfidf = new TfIdf();

            var tweetText = recentTweets.data.map(function (tweet) {
                if (tweet.text) {
                    var matchQuoated = tweet.text.match(/^"(.+)"/m);
                    return (matchQuoated) ? matchQuoated[1] : tweet.text;
                }
            });

            tfidf.addDocument(tweetText.reduce(function (acc, next) {
                return acc + ' ' + next;
            }, ''));

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

            wordImportance.forEach(function (importance) {
                if (topPositiveWords.length < MAX_ITEMS_PER_CATEGORY && positiveWords.indexOf(importance.term) != -1)
                    topPositiveWords.push(importance.term);

                if (topNegativeWords.length < MAX_ITEMS_PER_CATEGORY && negativeWords.indexOf(importance.term) != -1)
                    topNegativeWords.push(importance.term);
            });

            return {topPositiveWords: topPositiveWords, topNegativeWords: topNegativeWords};
        },
        getUser: function (screenName) {
            return twitter.get('users/show.json', {screen_name: screenName});
        }
    })
}
