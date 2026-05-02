(function initReactAlarmPanel() {
  const reactRootEl = document.getElementById("react-root");
  if (!reactRootEl || !window.React || !window.ReactDOM) {
    return;
  }

  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const useEffect = React.useEffect;
  const useState = React.useState;

  function ReactAlarmList() {
    const [alarms, setAlarms] = useState(
      window.AlarmAppBridge ? window.AlarmAppBridge.getAlarms() : []
    );
    const [is24Hour, setIs24Hour] = useState(window.AlarmAppBridge ? window.AlarmAppBridge.is24Hour() : true);

    useEffect(function subscribeToVanillaUpdates() {
      function handleUpdate(event) {
        const detail = event.detail || {};
        setAlarms(Array.isArray(detail.alarms) ? detail.alarms : []);
        setIs24Hour(Boolean(detail.use24Hour));
      }

      window.addEventListener("alarms-updated", handleUpdate);
      return function cleanup() {
        window.removeEventListener("alarms-updated", handleUpdate);
      };
    }, []);

    function formatAlarmTime(time) {
      if (window.AlarmAppBridge && typeof window.AlarmAppBridge.formatAlarm === "function") {
        return window.AlarmAppBridge.formatAlarm(time);
      }
      return time;
    }

    function onDelete(time) {
      if (window.AlarmAppBridge && typeof window.AlarmAppBridge.removeAlarm === "function") {
        window.AlarmAppBridge.removeAlarm(time);
      }
    }

    if (alarms.length === 0) {
      return React.createElement(
        "ul",
        { className: "alarms-list" },
        React.createElement("li", { className: "empty" }, "No alarms set.")
      );
    }

    return React.createElement(
      "ul",
      { className: "alarms-list" },
      alarms.map(function mapAlarm(time) {
        return React.createElement(
          "li",
          { key: time + "-" + is24Hour },
          React.createElement("span", null, formatAlarmTime(time)),
          React.createElement(
            "button",
            {
              type: "button",
              className: "delete-btn",
              onClick: function onClickDelete() {
                onDelete(time);
              },
            },
            "Delete"
          )
        );
      })
    );
  }

  const root = ReactDOM.createRoot(reactRootEl);
  root.render(React.createElement(ReactAlarmList));
})();
