FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css site-config.js site.js /usr/share/nginx/html/
COPY privacy /usr/share/nginx/html/privacy
COPY terms /usr/share/nginx/html/terms
COPY sms-terms /usr/share/nginx/html/sms-terms
COPY dev /usr/share/nginx/html/dev

EXPOSE 80
