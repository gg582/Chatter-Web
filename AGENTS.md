You need to write a front-end application for Chatter BBS, which is included at refs.
It should be written as vercel-deployable format, and you should match each CLI functions as modern GUI.
This relation should be similar to Kigo<->gnugo relation.
latest bug: error while serving. index.html not found. gemini has suggested this:
sudo ln -s /home/yjlee/.chatter-web/dist/index.html /home/yjlee/.chatter-web/index.html
sudo systemctl restart chatter-frontend.service
but this is too temporary
refactor it to fully installable one, including www-data permission, and source install at some global, separate folder
