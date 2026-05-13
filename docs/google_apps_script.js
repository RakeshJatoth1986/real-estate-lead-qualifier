/**
 * Google Apps Script — Real Estate Lead Qualifier Webhook
 * 
 * HOW TO USE:
 * 1. Open your Google Form → click the 3-dot menu → "Script editor"
 * 2. Paste this entire script
 * 3. Update BACKEND_URL and SECRET below
 * 4. Click "Save", then "Run" → authorize permissions
 * 5. Go to Triggers (clock icon) → Add Trigger:
 *      Function: onFormSubmit
 *      Event source: From form
 *      Event type: On form submit
 * 6. Save trigger
 * 
 * Your Google Form should have these fields (exact names matter):
 *   - Full Name        (Short answer)
 *   - Phone Number     (Short answer)
 *   - Email Address    (Short answer) [optional]
 *   - Property Type    (Multiple choice) [optional]
 *   - Preferred Area   (Short answer) [optional]
 *   - Notes            (Paragraph) [optional]
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
var BACKEND_URL = "http://localhost:8000/leads/ingest";  // Change to your server URL
var SECRET = "form_secret_token";                         // Must match GOOGLE_FORM_SECRET in .env
// ─────────────────────────────────────────────────────────────────────────────

function onFormSubmit(e) {
  try {
    var responses = e.namedValues;

    // Extract fields — adjust field names to match your Google Form questions
    var name  = getField(responses, ["Full Name", "Name", "Your Name"]);
    var phone = getField(responses, ["Phone Number", "Phone", "Mobile Number", "Contact Number"]);
    var email = getField(responses, ["Email Address", "Email", "Email ID"]);
    var propertyType = getField(responses, ["Property Type", "Type of Property"]);
    var location = getField(responses, ["Preferred Area", "Location", "Preferred Location", "Area"]);
    var notes = getField(responses, ["Notes", "Additional Notes", "Message", "Any other requirements"]);

    if (!name || !phone) {
      Logger.log("Missing required fields: name or phone");
      return;
    }

    // Clean phone number — remove spaces, dashes, +
    phone = phone.replace(/[\s\-\(\)]/g, "");
    if (!phone.startsWith("91") && phone.length === 10) {
      phone = "91" + phone;  // Add India country code
    }

    var payload = {
      name: name,
      phone: phone,
      email: email || null,
      source: "google_form",
      secret: SECRET,
      property_type: propertyType || null,
      location_preference: location || null,
      notes: notes || null
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(BACKEND_URL, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();

    Logger.log("Response Code: " + responseCode);
    Logger.log("Response Body: " + responseBody);

    if (responseCode === 200) {
      Logger.log("✅ Lead successfully sent to backend: " + name);
    } else {
      Logger.log("❌ Failed to send lead. Status: " + responseCode);
    }

  } catch (error) {
    Logger.log("❌ Error in onFormSubmit: " + error.toString());
  }
}

/**
 * Helper: get first non-empty value from multiple possible field names
 */
function getField(responses, fieldNames) {
  for (var i = 0; i < fieldNames.length; i++) {
    var val = responses[fieldNames[i]];
    if (val && val[0] && val[0].trim() !== "") {
      return val[0].trim();
    }
  }
  return null;
}

/**
 * Test function — run manually to test the webhook without a form submission
 */
function testWebhook() {
  var testPayload = {
    name: "Test Lead",
    phone: "919999999999",
    email: "test@example.com",
    source: "google_form",
    secret: SECRET,
    property_type: "Apartment",
    location_preference: "Whitefield",
    notes: "Test submission from Apps Script"
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(BACKEND_URL, options);
  Logger.log("Test Response: " + response.getContentText());
}
