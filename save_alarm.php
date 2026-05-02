<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

$filePath = __DIR__ . DIRECTORY_SEPARATOR . "alarms.json";

function normalizeAlarms($items) {
    if (!is_array($items)) {
        return [];
    }

    $valid = array_filter($items, function ($item) {
        return is_string($item) && preg_match("/^\d{2}:\d{2}$/", $item);
    });

    $unique = array_values(array_unique($valid));
    sort($unique);
    return $unique;
}

function loadAlarmsFromFile($filePath) {
    if (!file_exists($filePath)) {
        file_put_contents($filePath, json_encode(["alarms" => []], JSON_PRETTY_PRINT));
    }

    $content = file_get_contents($filePath);
    $decoded = json_decode($content, true);

    if (!is_array($decoded) || !isset($decoded["alarms"])) {
        return [];
    }

    return normalizeAlarms($decoded["alarms"]);
}

function saveAlarmsToFile($filePath, $alarms) {
    if (file_exists($filePath) && !is_writable($filePath)) {
        return false;
    }

    if (!file_exists($filePath) && !is_writable(dirname($filePath))) {
        return false;
    }

    $json = json_encode(["alarms" => $alarms], JSON_PRETTY_PRINT);
    return file_put_contents($filePath, $json) !== false;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $alarms = loadAlarmsFromFile($filePath);
    echo json_encode([
        "alarms" => $alarms
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $rawInput = file_get_contents("php://input");
    $payload = json_decode($rawInput, true);

    if (!is_array($payload) || !isset($payload["alarms"]) || !is_array($payload["alarms"])) {
        http_response_code(400);
        echo json_encode([
            "error" => "Invalid payload. Expected { \"alarms\": [] }"
        ]);
        exit;
    }

    $valid = normalizeAlarms($payload["alarms"]);
    $saved = saveAlarmsToFile($filePath, $valid);

    if (!$saved) {
        http_response_code(500);
        echo json_encode([
            "error" => "Unable to write alarms.json. Check file permissions.",
            "alarms" => loadAlarmsFromFile($filePath)
        ]);
        exit;
    }

    echo json_encode([
        "alarms" => $valid
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "DELETE") {
    $rawInput = file_get_contents("php://input");
    $payload = json_decode($rawInput, true);

    if (!is_array($payload) || !isset($payload["alarm"]) || !is_string($payload["alarm"])) {
        http_response_code(400);
        echo json_encode([
            "error" => "Invalid payload. Expected { \"alarm\": \"HH:MM\" }"
        ]);
        exit;
    }

    $alarmToDelete = $payload["alarm"];
    if (!preg_match("/^\d{2}:\d{2}$/", $alarmToDelete)) {
        http_response_code(400);
        echo json_encode([
            "error" => "Invalid alarm format. Use HH:MM."
        ]);
        exit;
    }

    $alarms = loadAlarmsFromFile($filePath);
    $updated = array_values(array_filter($alarms, function ($item) use ($alarmToDelete) {
        return $item !== $alarmToDelete;
    }));

    $saved = saveAlarmsToFile($filePath, $updated);
    if (!$saved) {
        http_response_code(500);
        echo json_encode([
            "error" => "Unable to write alarms.json. Check file permissions.",
            "alarms" => $alarms
        ]);
        exit;
    }

    echo json_encode([
        "alarms" => normalizeAlarms($updated)
    ]);
    exit;
}

http_response_code(405);
echo json_encode([
    "error" => "Method not allowed."
]);
