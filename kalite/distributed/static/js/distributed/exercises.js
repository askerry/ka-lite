/*

TODO:
    - Fire an event when question has been loaded and displayed (to be used for marking start time on log.)

*/

window.ExerciseDataModel = Backbone.Model.extend({
    /*
    Contains data about an exercise itself, with no user-specific data.
    */

    defaults: {
        basepoints: 0,
        description: "",
        title: "",
        name: "",
        seconds_per_fast_problem: 0,
        author_name: "",
        related_videos: [],
        file_name: ""
    },

    initialize: function() {

        _.bindAll(this);

        // store the provided seed as an object attribute, so it will be available after a fetch
        this.listenTo(this, "change:seed", function() { this.seed = this.get("seed") || this.seed; });

    },

    url: function () {
        return "/api/exercise/" + this.get("exercise_id");
    },

    update_if_needed_then: function(callback) {
        if (this.get("exercise_id") !== this.get("name")) {
            this.fetch().then(callback);
        } else {
            _.defer(callback);
        }
    },

    // convert this data into the structure needed by khan-exercises
    as_user_exercise: function () {
        return {
            "basepoints": this.get("basepoints"),
            "description": this.get("description"),
            "title": this.get("display_name"),
            "seed": this.seed,
            "lastCountHints": 0, // TODO: could store and pass down number of hints used
            "exerciseModel": {
                "displayName": this.get("display_name"),
                "name": this.get("name"),
                "secondsPerFastProblem": this.get("seconds_per_fast_problem"),
                "authorName": this.get("author_name"),
                "relatedVideos": this.get("related_videos"),
                "fileName": this.get("file_name")
            },
            "exerciseProgress": {
                "level": "" // needed to keep khan-exercises from blowing up
            }
        };
    }
});


window.ExerciseLogModel = Backbone.Model.extend({
    /*
    Contains summary data about the user's history of interaction with the current exercise.
    */

    defaults: {
        points: 0,
        streak_progress: 0
    },

    init: function() {

        _.bindAll(this);

        var self = this;

        this.starting_points = 0;

        // keep track of how many points we started out with
        this.listenToOnce(this, "change:points", function() {
            self.starting_points = self.get("points")
        });

    },

    save: function() {

        var self = this;

        var already_complete = this.get("complete");

        if (this.get("attempts") > 20 && !this.get("complete")) {
            this.set("struggling", true);
        }

        this.set("complete", this.get("streak_progress") >= 100);

        if (!already_complete && this.get("complete")) {
            this.set("struggling", false);
            this.set("completion_timestamp", window.statusModel.get_server_time());
            this.set("attempts_before_completion", this.get("attempts"));
        }

        Backbone.Model.prototype.save.call(this)
            .then(function(data) {
                // update the top-right point display, now that we've saved the points successfully
                window.statusModel.set("newpoints", self.get("points") - self.starting_points);
            });
    },

    urlRoot: "/api/exerciselog/"

});

window.ExerciseLogCollection = Backbone.Collection.extend({

    model: ExerciseLogModel,

    initialize: function(models, options) {
        this.exercise_id = options.exercise_id;
    },

    url: function() {
        return "/api/exerciselog/?" + $.param({
            "exercise_id": this.exercise_id,
            "user": window.statusModel.get("user_id")
        });
    },

    get_first_log_or_new_log: function() {
        if (this.length > 0) {
            return this.at(0);
        } else { // create a new exercise log if none existed
            return new ExerciseLogModel({
                "exercise_id": this.exercise_id,
                "user": window.statusModel.get("user_uri")
            });
        }
    }

});


window.AttemptLogModel = Backbone.Model.extend({
    /*
    Contains data about the user's response to a particular exercise instance.
    */

    urlRoot: "/api/attemptlog/",

    defaults: {
        complete: false,
        points: 0,
        context_type: "",
        context_id: "",
        response_count: 0,
        response_log: "[]"
    },

    initialize: function(options) {

    },

    add_response_log_event: function(ev) {

        // inflate the stored JSON if needed
        if (!this._response_log_cache) {
            this._response_log_cache = JSON.parse(this.get("response_log") || "[]");
        }

        // set the timestamp to the current time
        ev.timestamp = window.statusModel.get_server_time();

        // add the event to the response log list
        this._response_log_cache.push(ev);

        // deflate the response log list so it will be saved along with the model later
        this.set("response_log", JSON.stringify(this._response_log_cache));

    }

});


window.AttemptLogCollection = Backbone.Collection.extend({

    model: AttemptLogModel,

    STREAK_WINDOW: 10,
    STREAK_CORRECT_NEEDED: 8,

    initialize: function(models, options) {
        this.exercise_id = options.exercise_id;
    },

    url: function() {
        return "/api/attemptlog/?" + $.param({
            "exercise_id": this.exercise_id,
            "user": window.statusModel.get("user_id"),
            "limit": this.STREAK_WINDOW
        });
    },

    add_new: function(attemptlog) {
        if (this.length == this.STREAK_WINDOW) {
            this.pop();
        }
        this.unshift(attemptlog);
    },

    get_streak_progress: function() {
        var count = 0;
        this.forEach(function(model) {
            count += model.get("correct") ? 1 : 0;
        });
        return count;
    },

    get_streak_progress_percent: function() {
        var streak_progress = this.get_streak_progress();
        return Math.min((streak_progress / this.STREAK_CORRECT_NEEDED) * 100, 100);
    },

    get_streak_points: function() {
        // only include attempts that were correct (others won't have points)
        var filtered_attempts = this.filter(function(attempt) { return attempt.get("correct"); });
        // add up and return the total number of points represented by these attempts
        // (only include the latest STREAK_CORRECT_NEEDED attempts, so the user doesn't get too many points)
        var total = 0;
        for (var i = 0; i < Math.min(this.STREAK_CORRECT_NEEDED, filtered_attempts.length); i++) {
            total += filtered_attempts[i].get("points");
        }
        return total;
    },

    calculate_points_per_question: function(basepoints) {
        // for comparability with the original algorithm (when a streak of 10 was needed),
        // we calibrate the points awarded for each question (note that there are no random bonuses now)
        return Math.round((basepoints * 10) / this.STREAK_CORRECT_NEEDED);
    }

});


function updatePercentCompleted(correct) {

    // update the streak; increment by 10 if correct, otherwise reset to 0
    if (correct && !exerciseData.hintUsed) {
        exerciseData.percentCompleted += 10;
        if (exerciseData.percentCompleted < 101) {
            bumpprob = Math.floor(Math.random()*100);
            bump = (bumpprob < 90) ? 1 : (bumpprob < 99 ? 1.5 : 2);
            inc = Math.ceil(exerciseData.basepoints*bump);
            exerciseData.points += inc;
            updateQuestionPoints(inc);
        }
    } else if (exerciseData.percentCompleted < 100) {
        exerciseData.percentCompleted = 0;
        exerciseData.points = 0;
    }

    // max out at the percentage completed at 100%
    exerciseData.percentCompleted = Math.min(exerciseData.percentCompleted, 100);

    // Increment the # of attempts
    exerciseData.attempts++;

}


window.ExerciseHintView = Backbone.View.extend({

    template: HB.template("exercise/exercise-hint"),

    initialize: function() {

        _.bindAll(this);

        this.render();

        // this.listenTo(this.model, "change", this.render);

    },

    render: function() {
        // this.$el.html(this.template(this.data_model.attributes));
        this.$el.html(this.template());
    }

});


window.ExerciseProgressView = Backbone.View.extend({

    template: HB.template("exercise/exercise-progress"),

    initialize: function() {

        _.bindAll(this);

        this.render();

        this.listenTo(this.model, "change", this.update_streak_bar);
        this.listenTo(this.collection, "add", this.update_attempt_display);

    },

    render: function() {
        // this.$el.html(this.template(this.data_model.attributes));
        this.$el.html(this.template());
        this.update_streak_bar();
        this.update_attempt_display();
    },

    update_streak_bar: function() {
        // update the streak bar UI
        this.$(".progress-bar")
            .css("width", this.model.get("streak_progress") + "%")
            .toggleClass("completed", this.model.get("complete"));
        this.$(".progress-points").html(this.model.get("points") > 0 ? "(" + this.model.get("points") + " " + gettext("points") + ")" : "");
    },

    update_attempt_display: function() {

        var attempt_text = "";

        this.collection.forEach(function(model) {
            attempt_text = (model.get("correct") ? "<span><b>&#10003;</b></span> " : "<span>&#10007;</span> ") + attempt_text;
        });

        this.$(".attempts").html(attempt_text);
        this.$(".attempts span:last").css("font-size", "1.1em");
    }
});


window.ExerciseView = Backbone.View.extend({

    template: HB.template("exercise/exercise"),

    initialize: function() {

        _.bindAll(this);

        // load the info about the exercise itself
        this.data_model = new ExerciseDataModel({exercise_id: this.options.exercise_id});
        this.data_model.fetch();

        this.render();

        this.initialize_khan_exercises_listeners();

        // this.adjust_scratchpad_margin();

    },

    events: {
        "click #scratchpad-show": "adjust_scratchpad_margin",
        "submit .answer-form": "answer_form_submitted"
    },

    render: function() {

        this.$el.html(this.template(this.data_model.attributes));

        this.initialize_listeners();

    },

    initialize_listeners: function() {

        // Catch the "next question" button click event -- needs to be explicit (not in "events")
        this.$("#next-question-button").click(this.next_question_clicked);

        this.listenTo(this.data_model, "change:title", this.update_title);

    },

    initialize_khan_exercises_listeners: function() {

        var self = this;

        $(Khan).bind("loaded", this.khan_loaded);

        $(Exercises).bind("checkAnswer", this.check_answer);

        $(Exercises).bind("gotoNextProblem", this.goto_next_problem);

        $(Exercises).bind("hintUsed", this.hint_used);

    },

    load_question: function(question_data) {

        var self = this;

        var defaults = {
            seed: Math.floor(Math.random() * 1000)
        };

        var question_data = $.extend(defaults, question_data);

        this.data_model.set(question_data);

        this.$("#workarea").html("<center>" + gettext("Loading...") + "</center>");

        this.data_model.update_if_needed_then(function() {
            var userExercise = self.data_model.as_user_exercise();
            $(Exercises).trigger("readyForNextProblem", {userExercise: userExercise});
        });

    },

    check_answer: function() {

        var data = Khan.scoreInput();

        this.trigger("check_answer", data);

    },

    next_question_clicked: function() {

        this.trigger("ready_for_next_question");

        // TODO
        // updateQuestionPoints(false);
        // this.attempt_model.set("hint_used", false);

    },

    adjust_scratchpad_margin: function() {
        if (Khan.scratchpad.isVisible()) {
            this.$(".current-card-contents #problemarea").css("margin-top", "50px");
        } else {
            this.$(".current-card-contents #problemarea").css("margin-top", "10px");
        }
    },

    answer_form_submitted: function(e) {
        e.preventDefault();
        this.$("#check-answer-button").click();
    },

    update_title: function() {
        this.$(".exercise-title").text(this.data_model.get("title"));
    },

    hint_used: function() {
        this.trigger("hint_used");
    },

    goto_next_problem: function() {
        // When ready for the next problem, hints matter again!
        hintsResetPoints = true;
        this.$(".hint-reminder").toggle(hintsResetPoints); // hide/show message about hints
    },

    khan_loaded: function() {
        $(Exercises).trigger("problemTemplateRendered");
        this.trigger("ready_for_next_question");
    },

    disable_answer_button: function() {
        this.$(".answer-buttons-enabled").hide();
        this.$(".answer-buttons-disabled").show();
    },

    enable_answer_button: function() {
        this.$(".answer-buttons-disabled").hide();
        this.$(".answer-buttons-enabled").show();
    }

});


window.ExercisePracticeView = Backbone.View.extend({

    initialize: function() {

        _.bindAll(this);

        this.exercise_view = new ExerciseView({
            el: this.el,
            exercise_id: this.options.exercise_id
        });

        this.exercise_view.on("ready_for_next_question", this.ready_for_next_question);
        this.exercise_view.on("hint_used", this.hint_used);

        this.hint_view = new ExerciseHintView({
            el: this.$(".exercise-hint-wrapper")
        });

        if (window.statusModel.get("is_logged_in")) {

            this.exercise_view.on("check_answer", this.check_answer);

            // disable the answer button for now; it will be re-enabled once we have the user data
            this.exercise_view.disable_answer_button();

            // load the data about the user's overall progress on the exercise
            this.log_collection = new ExerciseLogCollection([], {exercise_id: this.options.exercise_id});
            var log_collection_deferred = this.log_collection.fetch();

            // load the last 10 (or however many) specific attempts the user made on this exercise
            this.attempt_collection = new AttemptLogCollection([], {exercise_id: this.options.exercise_id});
            var attempt_collection_deferred = this.attempt_collection.fetch();

            // wait until both the exercise and attempt logs have been loaded before continuing
            this.user_data_loaded_deferred = $.when(log_collection_deferred, attempt_collection_deferred);
            this.user_data_loaded_deferred.then(this.user_data_loaded);

        }

    },

    user_data_loaded: function() {

        // get the exercise log model from the queried collection
        this.log_model = this.log_collection.get_first_log_or_new_log();

        // add some dummy attempt logs if needed, to match it up with the exercise log
        // (this is needed because attempt logs were not added until 0.13.0, so many older users have only exercise logs)
        if (this.attempt_collection.length < this.attempt_collection.STREAK_WINDOW) {
            var exercise_log_streak_progress = Math.min(this.log_model.get("streak_progress"), 100);
            while (this.attempt_collection.get_streak_progress_percent() < exercise_log_streak_progress) {
                this.attempt_collection.add({correct: true, complete: true, points: this.get_points_per_question()});
            }
        }

        // if the previous attempt was not yet complete, load it up again as the current attempt log model
        if (this.attempt_collection.length > 0 && !this.attempt_collection.at(0).get("completed")) {
            this.current_attempt_log = this.attempt_collection.at(0);
        }

        this.progress_view = new ExerciseProgressView({
            el: this.$(".exercise-progress-wrapper"),
            model: this.log_model,
            collection: this.attempt_collection
        });

        this.exercise_view.enable_answer_button();

    },

    initialize_new_attempt_log: function(data) {

        var defaults = {
            exercise_id: this.options.exercise_id,
            user: window.statusModel.get("user_uri"),
            context_type: this.options.context_type || "",
            context_id: this.options.context_id || "",
            language: "", // TODO(jamalex): get the current exercise language
            timestamp: window.statusModel.get_server_time(), // TODO(jamalex): set this timestamp later, when exercise is loaded, instead
            version: window.statusModel.get("version")
        };

        var data = $.extend(defaults, data);

        this.current_attempt_log = new AttemptLogModel(data);

        return this.current_attempt_log;

    },

    check_answer: function(data) {

        // increment the response count
        this.current_attempt_log.set("response_count", this.current_attempt_log.get("response_count") + 1);

        this.current_attempt_log.add_response_log_event({
            type: "answer",
            answer: data.guess,
            correct: data.correct
        });

        // update and save the exercise and attempt logs
        this.update_and_save_log_models("answer_given", data);
    },

    hint_used: function() {

        this.current_attempt_log.add_response_log_event({
            type: "hint"
        });

        this.update_and_save_log_models("hint_used", {correct: false, guess: ""});
    },

    get_points_per_question: function() {
        return this.attempt_collection.calculate_points_per_question(this.exercise_view.data_model.get("basepoints"));
    },

    update_and_save_log_models: function(event_type, data) {

        // if current attempt log has not been saved, then this is the user's first response to the question
        if (this.current_attempt_log.isNew()) {

            this.current_attempt_log.set({
                correct: data.correct,
                answer_given: data.guess,
                points: data.correct ? this.get_points_per_question() : 0
            });
            this.attempt_collection.add_new(this.current_attempt_log);

            // only change the streak progress and points if we're not already complete
            if (!this.log_model.get("complete")) {
                this.log_model.set({
                    streak_progress: this.attempt_collection.get_streak_progress_percent(),
                    points: this.attempt_collection.get_streak_points()
                });
            }

            this.log_model.set({
                attempts: this.log_model.get("attempts") + 1
            });

            this.log_model.save();

            this.$(".hint-reminder").hide(); // hide message about hints

        }

        // if a correct answer was given, then mark the attempt log as complete
        if (data.correct) {
            this.current_attempt_log.set({
                complete: true
            });
        }

        this.current_attempt_log.save();

    },

    ready_for_next_question: function() {

        var self = this;

        this.user_data_loaded_deferred.then(function() {

            // if this is the first attempt, or the previous attempt was complete, start a new attempt log
            if (!self.current_attempt_log || self.current_attempt_log.get("complete")) {
                self.exercise_view.load_question(); // will generate a new random seed to use
                self.initialize_new_attempt_log({seed: self.exercise_view.data_model.get("seed")});
            } else { // use the seed already established for this attempt
                self.exercise_view.load_question({seed: self.current_attempt_log.get("seed")});
            }

            self.$(".hint-reminder").show(); // show message about hints

        });

    }

});


window.ExerciseTestView = Backbone.View.extend({

    initialize: function() {

        _.bindAll(this);

        this.exercise_view = new ExerciseView({
            el: this.el,
            exercise_id: this.options.exercise_id
        });

        this.exercise_view.on("check_answer", this.check_answer);

    },

    check_answer: function(data) {

        // prevent the "check answer" button from shaking on incorrect answers
        this.$("#check-answer-button").parent().stop(jumpedToEnd=true);

    }

});
