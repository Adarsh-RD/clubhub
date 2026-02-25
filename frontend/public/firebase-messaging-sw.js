importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts(
    "https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js"
);

// We need to use compat version of firebase inside the service worker or v8 syntax
firebase.initializeApp({
    apiKey: new URL(location).searchParams.get("apiKey"),
    projectId: new URL(location).searchParams.get("projectId"),
    messagingSenderId: new URL(location).searchParams.get("messagingSenderId"),
    appId: new URL(location).searchParams.get("appId"),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log("Received background message: ", payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: "/favicon.ico",
        data: { url: payload.fcmOptions?.link || "/" }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
    console.log('On notification click: ', event.notification.tag);
    event.notification.close();

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
        clients.matchAll({
            type: "window"
        }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url == '/' && 'focus' in client)
                    return client.focus();
            }
            if (clients.openWindow) {
                // Open the URL passed from payload.data.url
                const targetUrl = event.notification.data.url || "/";
                return clients.openWindow(targetUrl);
            }
        })
    );
});
