# Teacher Sulemani: WhatsApp Training Coach (Pilot Version 0.1)

Sulemani is an AI training coach that staff use on WhatsApp. It answers questions only from the client's own training material, sets quiz questions, marks the answers against a pass mark, and records the results in the client's own spreadsheet.

This version covers the WhatsApp conversation service. Scheduled reminders, enrolment from HR lists and weekly manager reports will be handled separately in Make.com.


## 1. How it works

1. A learner sends a WhatsApp message to the Sulemani number.
2. Meta forwards the message to this service (the "webhook").
3. The service checks the message really came from Meta, then looks up the learner's phone number in each client's Learners list to find which company they belong to.
4. It reads that company's knowledge base, asks Claude to answer, quiz or mark, and sends the reply back on WhatsApp.
5. Every activity and score is written to that company's own records spreadsheet.

Client documents and staff records stay in the client's own Google Drive. The service holds them in memory for a few minutes only and keeps no copies. Fanisi holds only the configuration file, which lists each client's folder and spreadsheet IDs.


## 2. What the learner can do

1. Type "hi" or "menu" to see the welcome message and buttons.
2. Ask any question about their training material.
3. Tap "Take a quiz" (or type "quiz") to get a question, then type an answer in their own words. Sulemani marks it out of 100 and says whether it passed.
4. Tap "My progress" to see questions answered, passes and average score.
5. Type "skip" to skip a quiz question.

Voice notes and images are not yet supported; the learner is asked to type instead.


## 3. Try it today on your own computer

You only need a Claude API key for this step. No Meta or Google setup is needed.

1. Install Node.js version 20 or later from nodejs.org.
2. Open a terminal in this folder and run: npm install
3. Copy .env.example to a new file named .env and fill in ANTHROPIC_API_KEY.
4. Run: npm run chat
5. Chat as the sample learner Achieng. Type "hi" to begin. To chat as Brian instead, run: npm run chat -- 0700000002

The sample company, Kilele Solar, is fictional. Its knowledge base is in sample-client/knowledge and its learners in sample-client/learners.csv. Scores are written to data/kilele-solar-activity.csv.

To check the code without any keys at all, run: npm test


## 4. Files in this project

1. src/server.js: the web server that receives WhatsApp messages from Meta.
2. src/whatsapp.js: checks Meta's signature, reads incoming messages and sends replies.
3. src/router.js: finds which client a phone number belongs to.
4. src/handler.js: the conversation logic (menu, questions, quiz, marking, progress).
5. src/tutor.js: the instructions and calls to Claude.
6. src/storage/drive.js and src/storage/local.js: read the knowledge base and learners and write activity, from Google Drive or from local files.
7. config/clients.json: the list of clients and their settings.
8. scripts/simulate.js: the terminal chat for testing.


## 5. Adding a real client (Google Drive)

### 5.1 One-time setup for Fanisi

1. In the Google Cloud console, create a project (for example "Fanisi Sulemani"), enable the Google Drive API and the Google Sheets API, and create a service account.
2. Create a JSON key for the service account and download it.
3. Paste the whole key into GOOGLE_SERVICE_ACCOUNT_JSON in .env as one line.
4. Note the service account's email address (it ends in .iam.gserviceaccount.com). Clients will share their folders with this address.

This is not Google's app verification process. A service account works like a colleague that a folder is shared with, so no review is needed.

### 5.2 For each client

1. The client creates a folder in their Google Drive called, for example, "Sulemani Knowledge Base", and puts their training material in it as Google Docs. Plain .txt and .md files also work. PDFs and Word files are skipped, so they should be opened in Google Drive and saved as Google Docs.
2. The client creates a Google Sheet called, for example, "Sulemani Records", with two tabs:
   - Learners, with columns Phone, Name, Programme, Status in row 1. Status should be "Active" for anyone allowed to use Sulemani.
   - Activity, with columns Timestamp, Phone, Name, Activity, Detail, Score in row 1.
3. The client shares the folder with the service account email as Viewer, and the Sheet as Editor.
4. Add the client to config/clients.json, copying the "example-drive-client" entry. Set "enabled" to true and paste the folder ID and spreadsheet ID. Each ID is the long code in the address bar between "/folders/" or "/d/" and the next "/".

Phone numbers in the Learners tab can be written as 0712 345 678, +254712345678 or 254712345678.

### 5.3 Client settings

1. tutorName: the name learners see, for example "Coach Sulemani".
2. programmeDescription: used in the welcome message, for example "the Kilele Solar sales induction".
3. coachingStyle: how Sulemani should speak to this client's staff.
4. passMark: the score out of 100 needed to pass a quiz question.
5. logQuestionText: if false, questions are logged as activity without their text, which keeps practice private. Set to true only if the client wants managers to see the questions staff ask.


## 6. Connecting WhatsApp

### 6.1 Put the service online

The service must be reachable on the internet over HTTPS. Render (render.com) is the simplest option:

1. Put this folder in a private GitHub repository. The .gitignore file keeps .env and node_modules out.
2. In Render, create a new Web Service from that repository.
3. Build command: npm install. Start command: npm start.
4. Add every value from your .env file under Environment.
5. Choose a paid instance for pilots. Free instances go to sleep and the first message after a quiet period would be slow.
6. Once deployed, open https://your-service-name.onrender.com/health in a browser. It should show "ok": true.

Any host that runs Node.js will work the same way.

### 6.2 Meta settings

1. In your Meta app dashboard, open WhatsApp, then API Setup. Copy the Phone number ID into WHATSAPP_PHONE_NUMBER_ID.
2. Create a permanent access token through a System User in Meta Business Settings, with the whatsapp_business_messaging permission, and put it in WHATSAPP_TOKEN. The temporary token on the API Setup page expires after 24 hours.
3. In App settings, Basic, copy the App secret into WHATSAPP_APP_SECRET.
4. Choose any secret phrase and put it in WHATSAPP_VERIFY_TOKEN.
5. In WhatsApp, Configuration, set the Callback URL to https://your-service-name.onrender.com/webhook and the Verify token to the same phrase. Click Verify and save.
6. Under Webhook fields, subscribe to "messages".
7. Restart the service on Render after changing any environment value.

Then send "hi" from an enrolled phone number to the Sulemani number.

### 6.3 Points to note

1. The Meta account must be in good standing with a valid payment method for messages to be delivered.
2. Sulemani only replies to learners who message first, so no template messages are needed for this version. Daily reminders sent by Make.com will need approved templates.
3. GRAPH_API_VERSION is set to v23.0. Meta retires old versions over time, so check the dashboard and update it when needed.


## 7. Known limits of this pilot version

1. Conversation memory is kept in the server's memory for 2 hours. If the service restarts, learners lose the thread of their current conversation, but their scores are safe in the records sheet.
2. Each client's knowledge base is sent to Claude in full, up to KB_MAX_CHARS (about 150,000 characters, roughly 60 pages). Larger knowledge bases will need a search index, which is planned for a later version.
3. Only files directly in the knowledge folder are read, not subfolders.
4. Role-play and voice notes are not yet included.
5. The Activity tab is read in full to show progress. This is fine for pilots but should be optimised for clients with thousands of learners.
