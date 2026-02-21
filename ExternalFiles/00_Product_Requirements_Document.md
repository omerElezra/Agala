# Product Requirements Document (PRD): AI-Powered Household Grocery List

## 1. Product Overview
A smart grocery list application designed for households. The core value proposition is an AI engine that learns the household's consumption patterns and automatically suggests or adds products to the list, minimizing manual data entry.

## 2. Core Entities & Architecture Concepts
* **Household-Centric:** The primary entity is the `Household`, not the individual user. Multiple users (e.g., partners) sync in real-time to the same Household ID. 
    * *Example:* If Ravit checks off "Milk" in the supermarket, the list updates instantly on all other devices connected to the household without requiring a refresh.
* **Medium-Resolution Catalog:** Products are defined by a generic name + distinguishing attribute (e.g., "Yellow Cheese 200g", "Milk 3%"). Highly specific brands (e.g., "Tnuva Emek 28% slices") are avoided unless manually forced by the user to prevent catalog fragmentation.

## 3. Core User Flows
### 3.1 Adding Products
* **Manual Entry:** User types a product. Auto-complete suggests from the existing catalog to prevent duplicates.
* **Quantity:** Optional field. Defaults to `1`. 

### 3.2 The Shopping Experience (Check-off)
* **No "Checkout" Button:** The shopping session does not require a collective "Finish Shopping" action.
* **Individual Item Action (The 'V'):** Tapping an item marks it as "Purchased". The item is removed from the active list, and the timestamp of this action is saved as the new baseline for the prediction algorithm.
* **Debounce/Undo:** A 5-10 second grace period exists after marking an item to allow the user to undo the action without polluting the AI's purchase history data.

### 3.3 The "Snooze/Skip" Feature (Handling Bulk & Sales)
* When the AI suggests an item, but the household already has enough (e.g., due to a previous bulk purchase), the user taps "Snooze" (דילוג).
* The system prompts: "When to remind?" (Next week / In two weeks / Manual only).
* *Data implication:* This acts as a penalty/adjustment signal to the algorithm, recalibrating the expected consumption interval.

## 4. AI & Prediction Engine Logic
The prediction engine operates on a Time-Series basis, calculating the interval between purchase timestamps.

* **Baseline Calculation:** Uses Exponential Moving Average (EMA) to determine the next expected purchase date, giving higher weight to recent purchases to adapt to changing household needs (e.g., children growing up and consuming different quantities).
* **Quantity Logic:**
    * If no quantity is entered, the AI measures the standard interval between purchase dates.
    * If a user inputs a quantity $X$ (where $X > 1$), the algorithm multiplies the standard expected interval by $X$ before suggesting the item again.
* **Confidence Levels & UI Representation:**
    * **High Confidence (>90%):** Consistent purchase intervals. The item is **Auto-Added** to the list with a visual indicator (e.g., "✨ Auto-added").
    * **Medium Confidence:** The interval is reached, but variance is high. The item appears in a separate **"Suggestions/Discovery"** section at the top. The user can add it with one tap, which trains the model to increase confidence for next time.
    * **Penalty:** If an Auto-Added item is manually deleted (swiped away) by the user, its confidence score drops, and it will be relegated to the "Suggestions" tier in the next cycle.