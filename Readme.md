# Bubble App Data Manager

This a simple template for replacing the 'App Data' tab of the bubble editor for basic database admin. The 'App Data' page is really awful, and using Bubble to build admin pages with custom tables to manage your database is both tedious and limited. Bubble is not great at building tables for data, however nice tables are very easy and reliably built with AI.

![Screenshot](screenshots/default_view.png)

_This improved database manager is a single .html file that can be opened in any browser on any device to manage your bubble database, just like you're using a webpage. This is all frontend code and does not require a python server or any setup beyond adding your app URL and API key when prompted. It is recommended to import your option sets so they appear in dropdowns and don't need to be typed out._

## Features

- Simple, glitch-free, responsive UX for viewing and editing all of your data tables
- Automatically detects your app's data types and fields and populates everything for you
- Uses at least 10x-20x less RAM than a bubble editor window in your browser and has more features
- Drag and drop column reordering and column positions can be saved permanently
- Use 'today's date' to create dynamic constraint views of your database that can be saved to always use the current date/time
- Inline row editing with a JSON editor popup that avoids sytnax errors and calendar picker for date typed fields
- Bulk editing a column for multiple rows
- Easily delete or duplicate multiple rows (or every row of a constraint view)
- Export any or ALL data types (in your custom column order) to CSV files at once
- This file relies only on standard html and javascript and will open in any browser, on any device, in any enviroment. Works great on mobile.
- You have the code. Throw this single script in your favorite AI, tell it any changes you want to make, and it will be done without wasting a minute clicking through whatever UI changes Bubble is currently experimenting with. Easier, faster, and none of Bubble's UI limitations

- Limitations of this script:
  - Will only load data types that have Data API enabled in Settings>API>Public API endpoints. (All columns will have read/write access regardless of privacy rules if the Data API is enabled for that data type because this uses an Admin API token, not a user token)
  - When you enter your API token, it is saved unencrypted in your browser so it is not secure if a hacker gains control of your browser. It can't be saved in your browser keychain because it is a local file, not a website. If you want to run a python enviroment you could easily avoid this.
  - Option sets have to be loaded manually. This takes less <10 min. Bubble does not have an options set API, but again you could probably scrape them if you add a python enviroment to this.
  - Bubble does not allow editing Slug fields via API
  - The search uses bubble's exact string match search which sucks, the keyword filter has better substring searching but only searches the current page (100 rows)
  - Table data changes need to be refreshed manually unless you want to refresh the table on a timer or add a python environment...
  - Have not added the 'send this view to a backend wf' feature that bubble calls 'Bulk' on the 'App data' tab of the bubble editor, because that isn't a feature I use

## Setup

### Prerequites

- This script relies on API access to your app. 'Enable Data API' and the checkbox for each data type you want to access must be checked in your Bubble apps Settings>API>Public API endpoints.
- Use 'field display instead of ID for key names' must also be checked
- You will need to enter an API key into this script, so you need to review the code, or have an AI do a security review for you, to make sure this script isn't sending your keys anywhere other than your bubble app. Don't put your API key in random scripts you find on Github from unknown users.

Note: This does NOT require exposing your Swagger file, and it is generally recommended to select 'Hide Swagger API' in bubble's API settings.

### Basic Setup

- Download or copy [bubble_data_manager.html](bubble_data_manager.html) and open it in any browser. Enter your Bubble app's URL and API_TOKEN (Bubble Settings>API>Admin API Tokens) when prompted.

- That's it. It will automatically connect to your database using your bubble API token and load all data types and fields and generate tables for every data type that has the API access granted in your Bubble Settings. It will behave near exactly as if the page was part of your bubble app.
- You can click 'edit column order' to drag and drop columns and create custom constraint and column filter views.

Edit rows right in the table view:
![Screenshot](screenshots/edit_row.png)

Create rows from the table view:
![Screenshot](screenshots/add_row.png)

Delete Rows:
![Screenshot](screenshots/delete_row.png)


- Note that the live and test versions of your app will necessarily save different versions of your settings (because they many not have the same fields). You can setup and save settings for each branch manually or you can set everything up in your live branch and use a desktop browser's console to copy and paste the settings to the test branch:

~~~
# Setup and save custom column ordering and constraint views
# View your settings json data:
localStorage.getItem('bubble_data_manager_settings_<yourdomain.com>');
# Copy that json data output and insert it into this:
localStorage.setItem('bubble_data_manager_settings_<your_url.com/test-version>', JSON.stringify({your_json_content}));
~~~

### Load Option Sets

Loading your app's option sets requires one extra step. This is not strictly necessary, but it makes it easier to edit fields that use option sets. [Everything works without importing option sets, but if you choose not to add option sets, editing fields that use option sets requires typing out option names exactly correct (or else saving changes will fail with an error message).]

- All of your app's option sets are public data that bubble does not allow you to hide, but options are not available by API, and your browser will block this script from attempting to pull it from your app's URL via https... So you could run a python server to scrape them or... create and maintain a backend workflow API endpoint for your option sets. Fortunately, creating an endpoint for options is very simple to do:
  - Create a public GET backend API workflow. No authentication is necessary because all of your option sets are always public. It must be named 'get-options' (or modify bubble_data_manager.html to use a different name):

  ![Screenshot](screenshots/create_api.png)

  - Add each option set as a parameter. Set the key as the option set name, set 'is list', and set the content to all of that set's options:

  ![Screenshot](screenshots/add_options_as_parameters.png)
  Even with a large number of option sets, this does not take very long.
  - That's it. Fields that use option sets will be detected and typed dropdowns will be provided to aid choosing options.
  - New option sets will need to be added to the API, however, changes to any individual options in a set update automatically once a set has been added.

### Other Settings:

You can also edit [bubble_data_manager.html](bubble_data_manager.html) to change the default database branch on page load and set the script to always exclude specific data types:

~~~javascript
        let VERSION = ''; // Default database branch to load. Options are '/version-test' or '' (live database)
~~~

~~~javascript
        const EXCLUDED_TYPES = []; // list any data types you want this script to always ignore entirely
