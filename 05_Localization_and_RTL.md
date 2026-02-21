# Localization & RTL Document: Smart Grocery List App

## 1. Overview
This application is strictly targeted at the Israeli market. The entire User Interface (UI), system messages, and data formatting MUST be in Hebrew. 

## 2. Right-to-Left (RTL) Configuration
The coding agent MUST configure the React Native / Expo environment for RTL from the very first initialization step.
* **Expo Config:** Ensure `expo.rtl` is configured properly in `app.json`.
* **I18nManager:** Use `I18nManager.allowRTL(true)` and `I18nManager.forceRTL(true)` at the app's entry point to force the layout direction.

## 3. Styling Rules (Strict enforcement)
To ensure the UI flips correctly for RTL:
* NEVER use `marginLeft` or `marginRight`. You MUST use `marginStart` and `marginEnd`.
* NEVER use `paddingLeft` or `paddingRight`. You MUST use `paddingStart` and `paddingEnd`.
* NEVER use `left` or `right` for absolute positioning. Use `start` and `end`.
* Flexbox directions (`flexDirection: 'row'`) will naturally flip in RTL mode, so do not manually reverse arrays or UI elements.

## 4. Date & Time Formatting
All dates and times displayed to the user must use the `he-IL` locale.
* If using a library like `date-fns` or `dayjs`, explicitly import and set the Hebrew locale.
* Display formats should be intuitive for Hebrew speakers (e.g., "לפני יומיים", "בעוד שבוע").

## 5. UI Copy & Text
* No translation libraries (like `i18next`) are needed for the MVP to keep the bundle size small. Hardcode all UI strings in Hebrew directly in the components.
* Ensure standard Hebrew system fonts render correctly across iOS and Android without clipping.