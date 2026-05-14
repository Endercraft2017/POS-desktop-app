import { registerRootComponent } from 'expo';
import React, { useEffect, useRef } from 'react';
import { SafeAreaView, StatusBar, View, ActivityIndicator, Text, BackHandler, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

const POS_URL = 'http://3ks.afkcube.com/app/';

// Injected into the WebView right before the page loads. Bridges SPA history
// changes back to React Native via postMessage so the native BackHandler can
// know whether `WebView.goBack()` will actually do anything.
//
// react-native-webview's onNavigationStateChange only fires on URL changes —
// it does NOT fire on `history.pushState(state, '', undefined)` where the URL
// stays the same. The MessagesPage sentinel is exactly that kind of push, so
// without this bridge the native side thinks history is empty and lets Android
// exit the app on back-press.
const HISTORY_BRIDGE = `
(function () {
  function notify() {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'history',
          length: window.history.length,
          canGoBack: window.history.length > 1,
        }));
      }
    } catch (e) {}
  }
  var origPush = window.history.pushState;
  window.history.pushState = function () {
    var r = origPush.apply(this, arguments);
    notify();
    return r;
  };
  var origReplace = window.history.replaceState;
  window.history.replaceState = function () {
    var r = origReplace.apply(this, arguments);
    notify();
    return r;
  };
  window.addEventListener('popstate', notify);
  // Initial push so RN gets a baseline as soon as the page is up.
  setTimeout(notify, 0);
  true;
})();
`;

function LoadingView() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Loading POS...</Text>
    </View>
  );
}

function App() {
  const webviewRef = useRef(null);
  // canGoBack is updated by the injected history bridge below (NOT by
  // onNavigationStateChange — that only fires on real URL changes, not on
  // SPA pushState within the same URL).
  const canGoBackRef = useRef(false);

  // Forward Android's hardware back press (button OR edge-swipe gesture) to
  // the WebView. WebView.goBack() pops one history entry inside the page,
  // which fires `popstate` in the JS context — that's what the web MessagesPage
  // listens for to open its threads drawer. If the WebView has no back history,
  // we let the default behavior run (which closes the app).
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBackRef.current && webviewRef.current) {
        webviewRef.current.goBack();
        return true; // we handled it; do NOT exit the app
      }
      return false; // let RN's default exit-the-activity behavior run
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={{ uri: POS_URL }}
        style={{ flex: 1, backgroundColor: '#0F172A' }}
        startInLoadingState
        renderLoading={LoadingView}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        originWhitelist={['*']}
        cacheEnabled
        // Voice-to-text on the chat needs the WebView's getUserMedia(audio)
        // call to succeed. Android: RECORD_AUDIO is declared in app.json,
        // and react-native-webview's WebChromeClient auto-grants when the
        // manifest permission is present. iOS: this prop tells the WebView
        // to grant any media-capture request without showing its own prompt
        // (the system mic prompt is still triggered by NSMicrophoneUsage).
        mediaCapturePermissionGrantType="grant"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // Inject the history bridge so we hear about pushState navigations
        // (which onNavigationStateChange misses). injectedJavaScriptBeforeContentLoaded
        // runs in every page load including reloads.
        injectedJavaScriptBeforeContentLoaded={HISTORY_BRIDGE}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data && data.type === 'history') {
              canGoBackRef.current = !!data.canGoBack;
            } else if (data && data.type === 'download' && data.url) {
              // The WebView's <a download> click silently fails, so the web
              // bundle bridges downloads to us. We delegate to the system
              // browser via Linking.openURL — the URL is a public /api/media/...
              // path and the server sends Content-Disposition: attachment, so
              // the browser handles the actual save-to-device step.
              Linking.openURL(data.url).catch((e) => {
                console.warn('[download] Linking.openURL failed:', e && e.message);
              });
            }
          } catch (e) {
            // Non-JSON messages from the page are ignored
          }
        }}
        // Keep canGoBack accurate for real URL navigations too (full reloads).
        onNavigationStateChange={(state) => {
          canGoBackRef.current = state.canGoBack;
        }}
      />
    </SafeAreaView>
  );
}

registerRootComponent(App);
