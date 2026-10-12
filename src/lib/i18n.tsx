"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================================
// SECTION: Supported locales
// ============================================================

export const LOCALES = ["en", "el"] as const;
export type Locale = (typeof LOCALES)[number];

// ============================================================
// SECTION: Message dictionary
// ------------------------------------------------------------
// English is the source of truth; Greek must define every key
// (enforced at compile time via Record<MessageKey, string>).
// Adding UI text: add the key here first, then use `t("key")`.
// ============================================================

const en = {
  // -- App / common --
  "app.name": "Ordix",
  "app.tagline": "Orders & Inventory",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.notes": "Notes",
  "common.note": "Note",
  "common.reason": "Reason",
  "common.quantity": "Qty",
  "common.total": "Total",
  "common.items": "items",
  "common.units": "units",
  "common.all": "All",
  "common.active": "Active",
  "common.inactive": "Inactive",
  "common.back": "Back",
  "common.retry": "Retry",
  "common.optional": "optional",
  "common.yes": "Yes",
  "common.no": "No",
  "common.never": "Never",

  // -- Navigation --
  "nav.home": "Home",
  "nav.order": "Order",
  "nav.orders": "Orders",
  "nav.prep": "Prep",
  "nav.products": "Products",
  "nav.categories": "Categories",
  "nav.stock": "Stock",
  "nav.adminSection": "Admin",
  "nav.signOut": "Sign out",
  "nav.install": "Install app",

  // -- Login --
  "login.title": "Sign in to Ordix",
  "login.subtitle": "Order management & inventory",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.error": "Invalid email or password",
  "login.demoHint": "Seeded demo accounts:",
  "login.demoAdmin": "admin / admin123",
  "login.demoStaff": "staff / staff123",

  // -- POS / order screen --
  "pos.searchPlaceholder": "Search name or part number…",
  "pos.outOfStock": "Out of stock",
  "pos.lowStock": "Low stock",
  "pos.stockLeft": "{count} in stock",
  "pos.cartEmpty": "Ticket is empty",
  "pos.cartEmptyHint": "Tap products to add them",
  "pos.clearCart": "Clear",
  "pos.customerName": "Customer / recipient",
  "pos.orderNotes": "Order notes",
  "pos.placeOrder": "Place order",
  "pos.appendRound": "Add round to {number}",
  "pos.appendBanner": "Appending round to {number}",
  "pos.stopAppend": "Cancel append",
  "pos.orderPlaced": "Order {number} placed",
  "pos.roundAdded": "Round added to {number}",
  "pos.oversellBlocked": "Only {count} available for {name}",
  "pos.confirmPlaceTitle": "Place order?",
  "pos.confirmPlaceBody":
    "{units} units · {total}. The order goes straight to production.",
  "pos.confirmAppendTitle": "Append round?",
  "pos.confirmAppendBody": "{units} units will be added to order {number}.",
  "pos.perUnit": "{price} / {unit}",

  // -- Orders board --
  "orders.title": "Orders",
  "orders.activeTab": "Active",
  "orders.historyTab": "History",
  "orders.empty": "No orders",
  "orders.emptyHint": "New orders will appear here",
  "orders.filterAll": "All statuses",
  "orders.today": "Today",
  "orders.staleData": "Connection issue — showing last known data",

  // -- Order detail --
  "detail.title": "Order {number}",
  "detail.timeline": "Timeline",
  "detail.round": "Round {round}",
  "detail.packing": "Packing checklist",
  "detail.packingProgress": "{done}/{count} packed",
  "detail.voidItem": "Void",
  "detail.voidTitle": "Void item",
  "detail.voidReasonLabel": "Reason (required)",
  "detail.voidReasonPlaceholder": "e.g. out of stock, wrong part…",
  "detail.itemVoided": "Item voided",
  "detail.advance": "Mark as {status}",
  "detail.cancelOrder": "Cancel order",
  "detail.cancelTitle": "Cancel order",
  "detail.hold": "Put on hold",
  "detail.resume": "Resume",
  "detail.resumeTitle": "Resume order to stage:",
  "detail.courier": "Courier",
  "detail.tracking": "Tracking number",
  "detail.saveTracking": "Save courier info",
  "detail.trackingSaved": "Courier info saved",
  "detail.dispatchHint": "Record courier and tracking before dispatch.",
  "detail.createdBy": "Created by {name}",
  "detail.appendItems": "Append items",
  "detail.orderCancelled": "This order was cancelled",
  "detail.confirmCancel": "Cancel this order?",
  "detail.awaitingProduction": "Waiting",
  "detail.inProduction": "In production",
  "detail.produced": "Produced",
  "detail.paidInfo": "Paid by {method} · {time}",
  "detail.productionDone": "Production completed — waiting for payment",

  // -- Prep board --
  "prep.title": "Preparation",
  "prep.empty": "Nothing to prepare",
  "prep.emptyHint": "Placed orders will appear here",
  "prep.start": "Start preparing",
  "prep.done": "Mark prepared",
  "prep.queue": "Queue",
  "prep.inProgress": "In progress",

  // -- Admin: products --
  "products.title": "Products",
  "products.new": "New product",
  "products.edit": "Edit product",
  "products.name": "Name",
  "products.partNumber": "Part number",
  "products.description": "Description",
  "products.category": "Category",
  "products.price": "Base price (€)",
  "products.priceHelp": "Stored as integer cents (12.50 → 1250). Used when no box/piece price is set.",
  "products.itemsPerBox": "Items per box",
  "products.pricePerBox": "Price per box (€)",
  "products.pricePerItem": "Price per item (€)",
  "products.stock": "Stock",
  "products.minStock": "Min stock",
  "products.unit": "Unit",
  "products.barcode": "Barcode",
  "products.supplier": "Supplier",
  "products.weight": "Weight (g)",
  "products.imageUrl": "Image URL",
  "products.isActive": "Active",
  "products.saved": "Product saved",
  "products.deleted": "Product deleted",
  "products.deleteConfirm": "Delete “{name}”? Products used by orders are deactivated instead.",
  "products.selectCategory": "Select category…",
  "products.empty": "No products yet",

  // -- Admin: categories --
  "categories.title": "Categories",
  "categories.new": "New category",
  "categories.name": "Name (EN)",
  "categories.nameEl": "Name (EL)",
  "categories.sortOrder": "Sort order",
  "categories.saved": "Category saved",
  "categories.deleted": "Category deleted",
  "categories.deleteConfirm": "Delete “{name}”? Move or delete its products first.",
  "categories.moveUp": "Move up",
  "categories.moveDown": "Move down",
  "categories.empty": "No categories yet",

  // -- Admin: stock --
  "stock.title": "Stock",
  "stock.lowStockOnly": "Low stock only",
  "stock.current": "Stock",
  "stock.min": "Min",
  "stock.adjust": "Adjust",
  "stock.adjustTitle": "Adjust stock — {name}",
  "stock.currentLevel": "Current",
  "stock.newLevel": "New quantity",
  "stock.delta": "Delta (+/−)",
  "stock.reasonLabel": "Reason (required, logged)",
  "stock.reasonPlaceholder": "e.g. shelf count, damaged, received delivery",
  "stock.adjusted": "Stock adjusted",
  "stock.settings": "Behavior settings",
  "stock.allowOversell": "Allow overselling",
  "stock.allowOversellHint": "Orders may exceed available stock when enabled",
  "stock.restockOnVoid": "Restock on void",
  "stock.restockOnVoidHint": "Voided items return to stock when enabled",
  "stock.settingsSaved": "Settings saved",
  "stock.lowStockAlert": "{count} products at or below minimum",

  // -- Home launcher (giant tiles for first-time users) --
  "home.title": "What would you like to do?",
  "home.subtitle": "Tap a picture to start",
  "home.newOrder": "New order",
  "home.newOrderHint": "Pick products and place an order",
  "home.orders": "Orders",
  "home.ordersHint": "Follow and update existing orders",
  "home.production": "Production",
  "home.productionHint": "Send items to production and complete them",
  "home.cashier": "Cashier",
  "home.cashierHint": "Collect payment and close finished orders",
  "home.display": "Wall board",
  "home.displayHint": "Big screen view for the warehouse",

  // -- Big plain confirmations --
  "pos.confirmYes": "YES, place the order",
  "pos.confirmAppendYes": "YES, add the round",

  // -- Customer (order step 1) --
  "customer.select": "Select customer",
  "customer.change": "Change",
  "customer.search": "Search name or phone…",
  "customer.noneSelected": "No customer selected",
  "customer.new": "New customer",
  "customer.newTitle": "New customer",
  "customer.name": "Name",
  "customer.address": "Address",
  "customer.phone": "Phone",
  "customer.email": "Email",
  "customer.comments": "Comments",
  "customer.saved": "Customer saved",
  "customer.required": "Select a customer first",
  "customer.empty": "No customers found",
  "customer.noPhone": "—",

  // -- Boxes & items (order lines) --
  "pos.boxes": "Boxes",
  "pos.items": "Items",
  "pos.linePrice": "Price €",
  "pos.perBox": "{price}/box",
  "pos.perItem": "{price}/pc",

  // -- Production (replaces prep) --
  "nav.production": "Production",
  "production.title": "Production",
  "production.queue": "New orders",
  "production.working": "In production",
  "production.send": "▶ Send",
  "production.done": "✔ Done",
  "production.finishOrder": "Production finished",
  "production.sendAll": "Send everything to production",
  "production.empty": "No orders to produce",
  "production.allProduced": "All items produced — ready for the cashier",

  // -- Cashier (ταμείο) --
  "nav.cashier": "Cashier",
  "cashier.title": "Cashier",
  "cashier.ready": "Waiting for payment",
  "cashier.collect": "Collect & close order",
  "cashier.method": "Payment method",
  "cashier.cash": "Cash",
  "cashier.card": "Card",
  "cashier.transfer": "Transfer",
  "cashier.note": "Note (optional)",
  "cashier.closed": "Order completed — Ολοκληρώθηκε",
  "cashier.paidToday": "Completed today",
  "cashier.empty": "No orders waiting for payment",

  // -- Import --
  "import.title": "Import customers & products",
  "import.format": "File format",
  "import.paste": "Paste the file content here",
  "import.dryRun": "1) Check first (no changes)",
  "import.apply": "2) Import now",
  "import.report": "Check result",
  "import.applied": "Import finished",
  "import.customersCreated": "New customers: {count}",
  "import.customersUpdated": "Updated customers: {count}",
  "import.productsCreated": "New products: {count}",
  "import.productsUpdated": "Updated products: {count}",
  "import.categoriesCreated": "New categories: {count}",
  "import.errorCount": "Problems: {count}",

  // -- Errors --
  "error.generic": "Something went wrong",
  "error.network": "Network error — check your connection",
  "error.forbidden": "You don't have permission for this action",
  "error.stockInsufficient": "Not enough stock available",

  // -- Wall display board (/display) --
  "display.title": "Warehouse board",
  "display.queue": "Queue",
  "display.inProgress": "In progress",
  "display.prepared": "Prepared",
  "display.shipped": "Shipped",
  "display.minutes": "min",
  "display.updated": "Updated {time}",

  // -- Offline / sync --
  "offline.queued": "Saved offline — will sync automatically",
  "offline.pending": "{count} pending sync",
  "offline.offline": "Offline",
  "offline.synced": "Synced: {label}",
  "offline.syncFailed": "Sync failed: {label}",
} as const;

export type MessageKey = keyof typeof en;

const el: Record<MessageKey, string> = {
  // -- App / common --
  "app.name": "Ordix",
  "app.tagline": "Παραγγελίες & Απόθεμα",
  "common.save": "Αποθήκευση",
  "common.cancel": "Άκυρο",
  "common.delete": "Διαγραφή",
  "common.edit": "Επεξεργασία",
  "common.close": "Κλείσιμο",
  "common.confirm": "Επιβεβαίωση",
  "common.search": "Αναζήτηση",
  "common.loading": "Φόρτωση…",
  "common.add": "Προσθήκη",
  "common.remove": "Αφαίρεση",
  "common.notes": "Σημειώσεις",
  "common.note": "Σημείωση",
  "common.reason": "Αιτία",
  "common.quantity": "Ποσ.",
  "common.total": "Σύνολο",
  "common.items": "είδη",
  "common.units": "τεμ.",
  "common.all": "Όλα",
  "common.active": "Ενεργό",
  "common.inactive": "Ανενεργό",
  "common.back": "Πίσω",
  "common.retry": "Ξαναδοκιμάστε",
  "common.optional": "προαιρετικό",
  "common.yes": "Ναι",
  "common.no": "Όχι",
  "common.never": "Ποτέ",

  // -- Navigation --
  "nav.home": "Αρχική",
  "nav.order": "Παραγγελία",
  "nav.orders": "Παραγγελίες",
  "nav.prep": "Προετοιμασία",
  "nav.products": "Προϊόντα",
  "nav.categories": "Κατηγορίες",
  "nav.stock": "Απόθεμα",
  "nav.adminSection": "Διαχείριση",
  "nav.signOut": "Αποσύνδεση",
  "nav.install": "Εγκατάσταση εφαρμογής",

  // -- Login --
  "login.title": "Είσοδος στο Ordix",
  "login.subtitle": "Διαχείριση παραγγελιών & αποθέματος",
  "login.email": "Email",
  "login.password": "Κωδικός",
  "login.submit": "Είσοδος",
  "login.error": "Λάθος email ή κωδικός",
  "login.demoHint": "Λογαριασμοί επίδειξης:",
  "login.demoAdmin": "admin / admin123",
  "login.demoStaff": "staff / staff123",

  // -- POS / order screen --
  "pos.searchPlaceholder": "Αναζήτηση ονόματος ή κωδικού…",
  "pos.outOfStock": "Εκτός αποθέματος",
  "pos.lowStock": "Χαμηλό απόθεμα",
  "pos.stockLeft": "{count} διαθέσιμα",
  "pos.cartEmpty": "Το δελτίο είναι κενό",
  "pos.cartEmptyHint": "Πατήστε προϊόντα για να τα προσθέσετε",
  "pos.clearCart": "Καθαρισμός",
  "pos.customerName": "Πελάτης / παραλήπτης",
  "pos.orderNotes": "Σημειώσεις παραγγελίας",
  "pos.placeOrder": "Καταχώρηση",
  "pos.appendRound": "Προσθήκη γύρου σε {number}",
  "pos.appendBanner": "Προσθήκη γύρου σε {number}",
  "pos.stopAppend": "Ακύρωση προσθήκης",
  "pos.orderPlaced": "Παραγγελία {number} καταχωρήθηκε",
  "pos.roundAdded": "Γύρος προστέθηκε στην {number}",
  "pos.oversellBlocked": "Διαθέσιμα μόνο {count} για {name}",
  "pos.confirmPlaceTitle": "Καταχώρηση παραγγελίας;",
  "pos.confirmPlaceBody":
    "{units} τεμ. · {total}. Η παραγγελία πηγαίνει κατευθείαν στην παραγωγή.",
  "pos.confirmAppendTitle": "Προσθήκη γύρου;",
  "pos.confirmAppendBody": "{units} τεμ. θα προστεθούν στην παραγγελία {number}.",
  "pos.perUnit": "{price} / {unit}",

  // -- Orders board --
  "orders.title": "Παραγγελίες",
  "orders.activeTab": "Ενεργές",
  "orders.historyTab": "Ιστορικό",
  "orders.empty": "Καμία παραγγελία",
  "orders.emptyHint": "Οι νέες παραγγελίες θα εμφανιστούν εδώ",
  "orders.filterAll": "Όλες οι καταστάσεις",
  "orders.today": "Σήμερα",
  "orders.staleData": "Πρόβλημα σύνδεσης — εμφανίζονται τα τελευταία δεδομένα",

  // -- Order detail --
  "detail.title": "Παραγγελία {number}",
  "detail.timeline": "Ιστορικό ενεργειών",
  "detail.round": "Γύρος {round}",
  "detail.packing": "Λίστα συσκευασίας",
  "detail.packingProgress": "{done}/{count} συσκευασμένα",
  "detail.voidItem": "Ακύρωση",
  "detail.voidTitle": "Ακύρωση είδους",
  "detail.voidReasonLabel": "Αιτία (απαιτείται)",
  "detail.voidReasonPlaceholder": "π.χ. εκτός αποθέματος, λάθος κωδικός…",
  "detail.itemVoided": "Το είδος ακυρώθηκε",
  "detail.advance": "Μετάβαση σε: {status}",
  "detail.cancelOrder": "Ακύρωση παραγγελίας",
  "detail.cancelTitle": "Ακύρωση παραγγελίας",
  "detail.hold": "Σε αναμονή",
  "detail.resume": "Συνέχεια",
  "detail.resumeTitle": "Συνέχεια παραγγελίας σε στάδιο:",
  "detail.courier": "Κούριερ",
  "detail.tracking": "Αριθμός αποστολής",
  "detail.saveTracking": "Αποθήκευση στοιχείων αποστολής",
  "detail.trackingSaved": "Τα στοιχεία αποστολής αποθηκεύτηκαν",
  "detail.dispatchHint": "Καταγράψτε κούριερ και αριθμό αποστολής πριν την αποστολή.",
  "detail.createdBy": "Δημιουργήθηκε από {name}",
  "detail.appendItems": "Προσθήκη ειδών",
  "detail.orderCancelled": "Αυτή η παραγγελία ακυρώθηκε",
  "detail.confirmCancel": "Ακύρωση παραγγελίας;",
  "detail.awaitingProduction": "Σε αναμονή",
  "detail.inProduction": "Σε παραγωγή",
  "detail.produced": "Παράχθηκε",
  "detail.paidInfo": "Πληρώθηκε με {method} · {time}",
  "detail.productionDone": "Η παραγωγή ολοκληρώθηκε — αναμονή πληρωμής",

  // -- Prep board --
  "prep.title": "Προετοιμασία",
  "prep.empty": "Τίποτα προς προετοιμασία",
  "prep.emptyHint": "Οι καταχωρημένες παραγγελίες θα εμφανιστούν εδώ",
  "prep.start": "Έναρξη προετοιμασίας",
  "prep.done": "Έτοιμο",
  "prep.queue": "Ουρά",
  "prep.inProgress": "Σε εξέλιξη",

  // -- Admin: products --
  "products.title": "Προϊόντα",
  "products.new": "Νέο προϊόν",
  "products.edit": "Επεξεργασία προϊόντος",
  "products.name": "Όνομα",
  "products.partNumber": "Κωδικός προϊόντος",
  "products.description": "Περιγραφή",
  "products.category": "Κατηγορία",
  "products.price": "Βασική τιμή (€)",
  "products.priceHelp": "Αποθηκεύεται σε λεπτά (12.50 → 1250). Χρησιμοποιείται όταν δεν οριστεί τιμή κουτιού/τεμαχίου.",
  "products.itemsPerBox": "Τεμάχια ανά κουτί",
  "products.pricePerBox": "Τιμή ανά κουτί (€)",
  "products.pricePerItem": "Τιμή ανά τεμάχιο (€)",
  "products.stock": "Απόθεμα",
  "products.minStock": "Ελάχιστο απόθεμα",
  "products.unit": "Μονάδα",
  "products.barcode": "Barcode",
  "products.supplier": "Προμηθευτής",
  "products.weight": "Βάρος (γρ)",
  "products.imageUrl": "URL εικόνας",
  "products.isActive": "Ενεργό",
  "products.saved": "Το προϊόν αποθηκεύτηκε",
  "products.deleted": "Το προϊόν διαγράφηκε",
  "products.deleteConfirm": "Διαγραφή «{name}»; Προϊόντα που χρησιμοποιούνται σε παραγγελίες απενεργοποιούνται.",
  "products.selectCategory": "Επιλέξτε κατηγορία…",
  "products.empty": "Κανένα προϊόν ακόμη",

  // -- Admin: categories --
  "categories.title": "Κατηγορίες",
  "categories.new": "Νέα κατηγορία",
  "categories.name": "Όνομα (EN)",
  "categories.nameEl": "Όνομα (EL)",
  "categories.sortOrder": "Σειρά ταξινόμησης",
  "categories.saved": "Η κατηγορία αποθηκεύτηκε",
  "categories.deleted": "Η κατηγορία διαγράφηκε",
  "categories.deleteConfirm": "Διαγραφή «{name}»; Μετακινήστε ή διαγράψτε πρώτα τα προϊόντα της.",
  "categories.moveUp": "Μετακίνηση πάνω",
  "categories.moveDown": "Μετακίνηση κάτω",
  "categories.empty": "Καμία κατηγορία ακόμη",

  // -- Admin: stock --
  "stock.title": "Απόθεμα",
  "stock.lowStockOnly": "Μόνο χαμηλό απόθεμα",
  "stock.current": "Απόθεμα",
  "stock.min": "Ελάχ.",
  "stock.adjust": "Προσαρμογή",
  "stock.adjustTitle": "Προσαρμογή αποθέματος — {name}",
  "stock.currentLevel": "Τρέχον",
  "stock.newLevel": "Νέα ποσότητα",
  "stock.delta": "Μεταβολή (+/−)",
  "stock.reasonLabel": "Αιτία (απαιτείται, καταγράφεται)",
  "stock.reasonPlaceholder": "π.χ. απογραφή ραφιού, φθορά, παραλαβή",
  "stock.adjusted": "Το απόθεμα προσαρμόστηκε",
  "stock.settings": "Ρυθμίσεις συμπεριφοράς",
  "stock.allowOversell": "Να επιτρέπεται υπερπώληση",
  "stock.allowOversellHint": "Οι παραγγελίες μπορεί να ξεπερνούν το διαθέσιμο απόθεμα",
  "stock.restockOnVoid": "Επιστροφή αποθέματος σε ακύρωση",
  "stock.restockOnVoidHint": "Τα ακυρωμένα είδη επιστρέφουν στο απόθεμα",
  "stock.settingsSaved": "Οι ρυθμίσεις αποθηκεύτηκαν",
  "stock.lowStockAlert": "{count} προϊόντα στο ή κάτω από το ελάχιστο",

  // -- Home launcher (giant tiles for first-time users) --
  "home.title": "Τι θέλετε να κάνετε;",
  "home.subtitle": "Πατήστε μια εικόνα για να ξεκινήσετε",
  "home.newOrder": "Νέα παραγγελία",
  "home.newOrderHint": "Επιλέξτε προϊόντα και καταχωρήστε παραγγελία",
  "home.orders": "Παραγγελίες",
  "home.ordersHint": "Παρακολούθηση και ενημέρωση παραγγελιών",
  "home.production": "Παραγωγή",
  "home.productionHint": "Στείλτε είδη στην παραγωγή και ολοκληρώστε τα",
  "home.cashier": "Ταμείο",
  "home.cashierHint": "Είσπραξη και ολοκλήρωση παραγγελιών",
  "home.display": "Πίνακας αποθήκης",
  "home.displayHint": "Μεγάλη προβολή για την οθόνη αποθήκης",

  // -- Big plain confirmations --
  "pos.confirmYes": "ΝΑΙ, ΚΑΤΑΧΩΡΗΣΗ",
  "pos.confirmAppendYes": "ΝΑΙ, ΠΡΟΣΘΗΚΗ",

  // -- Customer (order step 1) --
  "customer.select": "Επιλογή πελάτη",
  "customer.change": "Αλλαγή",
  "customer.search": "Αναζήτηση ονόματος ή τηλεφώνου…",
  "customer.noneSelected": "Δεν επιλέχθηκε πελάτης",
  "customer.new": "Νέος πελάτης",
  "customer.newTitle": "Νέος πελάτης",
  "customer.name": "Όνομα",
  "customer.address": "Διεύθυνση",
  "customer.phone": "Τηλέφωνο",
  "customer.email": "Email",
  "customer.comments": "Σχόλια",
  "customer.saved": "Ο πελάτης αποθηκεύτηκε",
  "customer.required": "Επιλέξτε πρώτα πελάτη",
  "customer.empty": "Δεν βρέθηκαν πελάτες",
  "customer.noPhone": "—",

  // -- Boxes & items (order lines) --
  "pos.boxes": "Κουτιά",
  "pos.items": "Τεμάχια",
  "pos.linePrice": "Τιμή €",
  "pos.perBox": "{price}/κουτί",
  "pos.perItem": "{price}/τεμ",

  // -- Production (replaces prep) --
  "nav.production": "Παραγωγή",
  "production.title": "Παραγωγή",
  "production.queue": "Νέες παραγγελίες",
  "production.working": "Σε παραγωγή",
  "production.send": "▶ Αποστολή",
  "production.done": "✔ Έτοιμο",
  "production.finishOrder": "Η παραγωγή ολοκληρώθηκε",
  "production.sendAll": "Αποστολή όλων στην παραγωγή",
  "production.empty": "Καμία παραγγελία προς παραγωγή",
  "production.allProduced": "Όλα τα είδη έτοιμα — αναμονή για το ταμείο",

  // -- Cashier (ταμείο) --
  "nav.cashier": "Ταμείο",
  "cashier.title": "Ταμείο",
  "cashier.ready": "Αναμονή πληρωμής",
  "cashier.collect": "Είσπραξη & ολοκλήρωση",
  "cashier.method": "Τρόπος πληρωμής",
  "cashier.cash": "Μετρητά",
  "cashier.card": "Κάρτα",
  "cashier.transfer": "Τραπεζική",
  "cashier.note": "Σημείωση (προαιρετικό)",
  "cashier.closed": "Η παραγγελία ολοκληρώθηκε",
  "cashier.paidToday": "Ολοκληρώθηκαν σήμερα",
  "cashier.empty": "Καμία παραγγελία σε αναμονή πληρωμής",

  // -- Import --
  "import.title": "Εισαγωγή πελατών & προϊόντων",
  "import.format": "Τύπος αρχείου",
  "import.paste": "Επικολλήστε το περιεχόμενο του αρχείου",
  "import.dryRun": "1) Έλεγχος πρώτα (χωρίς αλλαγές)",
  "import.apply": "2) Εισαγωγή τώρα",
  "import.report": "Αποτέλεσμα ελέγχου",
  "import.applied": "Η εισαγωγή ολοκληρώθηκε",
  "import.customersCreated": "Νέοι πελάτες: {count}",
  "import.customersUpdated": "Ενημερωμένοι πελάτες: {count}",
  "import.productsCreated": "Νέα προϊόντα: {count}",
  "import.productsUpdated": "Ενημερωμένα προϊόντα: {count}",
  "import.categoriesCreated": "Νέες κατηγορίες: {count}",
  "import.errorCount": "Προβλήματα: {count}",

  // -- Errors --
  "error.generic": "Κάτι πήγε στραβά",
  "error.network": "Σφάλμα δικτύου — ελέγξτε τη σύνδεση",
  "error.forbidden": "Δεν έχετε δικαίωμα για αυτή την ενέργεια",
  "error.stockInsufficient": "Δεν υπάρχει αρκετό απόθεμα",

  // -- Wall display board (/display) --
  "display.title": "Πίνακας αποθήκης",
  "display.queue": "Ουρά",
  "display.inProgress": "Σε εξέλιξη",
  "display.prepared": "Έτοιμα",
  "display.shipped": "Απεστάλησαν",
  "display.minutes": "λεπ",
  "display.updated": "Ενημερώθηκε {time}",

  // -- Offline / sync --
  "offline.queued": "Αποθηκεύτηκε τοπικά — θα συγχρονιστεί αυτόματα",
  "offline.pending": "{count} εκκρεμούν συγχρονισμού",
  "offline.offline": "Εκτός σύνδεσης",
  "offline.synced": "Συγχρονίστηκε: {label}",
  "offline.syncFailed": "Αποτυχία συγχρονισμού: {label}",
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, el };

// ============================================================
// SECTION: Locale store & translation hook
// ============================================================

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Persisted locale preference (localStorage "ordix-locale"). */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "ordix-locale",
      onRehydrateStorage: () => (state) => {
        // First run on this device (nothing saved yet): follow the
        // device language — a Greek-set tablet starts in Greek with
        // zero taps. Explicit choice always wins afterwards.
        if (state && state.locale === "en" && typeof navigator !== "undefined") {
          try {
            if (!localStorage.getItem("ordix-locale")) {
              const browser = (navigator.language ?? "en").toLowerCase();
              if (browser.startsWith("el")) {
                useLocaleStore.getState().setLocale("el");
              }
            }
          } catch {
            // storage unavailable — keep default
          }
        }
      },
    }
  )
);

/**
 * Translation hook: `const t = useT(); t("pos.placeOrder")`.
 * Supports `{placeholder}` interpolation via the optional vars map.
 */
export function useT() {
  const locale = useLocaleStore((state) => state.locale);
  return (key: MessageKey, vars?: Record<string, string | number>): string =>
    translate(key, vars);
}

// ============================================================
// SECTION: Non-React translation access
// ------------------------------------------------------------
// For code outside components (outbox flush toasts, service
// helpers) that still needs localized strings.
// ============================================================

export function getLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export function translate(
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const locale = getLocale();
  let text: string = dictionaries[locale][key] ?? en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Reactive locale for components that need it directly (dates etc.). */
export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}
