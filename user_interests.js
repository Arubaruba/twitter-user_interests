Router.route('/', function () {
    this.render('login');
});

Router.route('/users', function () {
    this.layout('user_interests');
    this.render('message', {data: {message: 'Search for a user to get started'}});
});

Router.route('/user/:id', function () {
    this.layout('user_interests');
    this.call('getUser', this.params.screenName, function(err, userData) {
        if (err) {
            this.render('message', {data: {message: 'User data for user \"' + this.params.screenName + '\" couldn\'t be retrieved.'}});
        } else {
            this.render('search_found_user', {data: userData})
        }
    });
});

if (Meteor.isClient) {
    // counter starts at 0
    //Session.setDefault('counter', 0);
    //Session.setDefault('userId', 0);

    Template.user_interests.events ({
        "click .go-button": function () {
            var screenName = $('.search-field').val();
            if (text) {
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

    Template.search_found_user.helpers({
        userName: 'Barack Obama',
        imageUrl: 'https://pbs.twimg.com/profile_images/451007105391022080/iu1f7brY.png',
        interests: [
            {name: 'Golf', like: true},
            {name: 'Smoking', like: true},
            {name: 'Guns', like: false}
        ]
    });

    Template.hello.events({
        'click button': function () {
            //Twitter.requestCredential();
            Meteor.loginWithTwitter(function () {
                Session.set('userId', Accounts.userId());
                Meteor.call('getFollowers', function (err, result) {
                    console.log(JSON.stringify(err));
                    console.log(result.data);
                });
            });
        }
    });
}

if (Meteor.isServer) {

    var twitter = new TwitterApi();
    var natural = Meteor.npmRequire('natural');

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

    Meteor.methods({
        getFollowers: function () {
            return twitter.get('followers/ids.json');
        },
        getUser: function (screenName) {
            return twitter.get('users/show.json', {screen_name: screenName});
        }
    })
}
