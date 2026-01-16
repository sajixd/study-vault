# 📂 Study Vault

A secure, Google Drive-like file management application built with **React**, **Vite**, and **Supabase**.

## ✨ Features

*   **🔒 Secure Authentication**: OTP-based login via Email (powered by Supabase).
*   **📁 File Management**: Create folders, upload files, rename, and organize your documents.
*   **🗑️ Trash System**: Move items to trash, restore them, or permanently delete them.
*   **📱 Fully Responsive**: Optimized for both Desktop and Mobile devices.
*   **🎨 Modern UI**: Hacker/Dark themed interface with neon accents.
*   **☁️ Cloud Storage**: All files are securely stored in Supabase Storage.

## 🛠️ Tech Stack

*   **Frontend**: React.js, Vite
*   **Backend & Database**: Supabase (PostgreSQL)
*   **Storage**: Supabase Storage
*   **Mobile**: Capacitor (Android APK)

## 🚀 Getting Started

### Prerequisites

*   Node.js installed
*   Supabase account

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/sajixd/study-vault.git
    cd study-vault
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up Environment Variables:
    Create a `.env` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_KEY=your_supabase_anon_key
    ```

4.  Run locally:
    ```bash
    npm run dev
    ```

## 📱 Android Build

To build the Android APK:

```bash
npx cap sync
cd android
./gradlew assembleRelease
```

---
*Built with ❤️ by Sajid*
