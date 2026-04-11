# 🌈 Iris - Token Color Editor for MDS

✨ **Welcome to Iris**, the official Design Token Color Editor for the open-source **Masala Design System (MDS)**! ✨

Iris is a powerful, React-based visual editor specifically built to seamlessly configure and test design tokens for MDS. It provides a stunning, interactive interface to tweak your color palettes, ghost buttons, and segmented toggles in real-time. Whether you are aiming for a classic aesthetic, a sleek dark mode, or a futuristic look, Iris makes modifying MDS tokens an absolute breeze! 🚀

---

## 🎨 What is Masala Design System (MDS)?

**Masala Design System (MDS)** is Innovaccer's comprehensive, open-source design system. It brings consistent, accessible, and highly-customizable UI components to your fingertips. Iris pairs directly with the MDS Storybook to make token customization incredibly intuitive. 🌶️

---

## ⚙️ How It Works

Iris provides a unique, lightning-fast developer experience with its **Live-Sync Bridge**:

1. **BroadcastChannel Integration**: The Token Editor and the MDS Storybook are connected via a `BroadcastChannel`. 📡
2. **Real-time Tweaks**: Whenever you adjust a color map, hue, or saturation in the Token Editor, the corresponding CSS variables are updated.
3. **Instant Preview**: Those CSS variable updates are instantly broadcasted to the Storybook preview iframe! You get immediate visual feedback on your components without needing a refresh. ⚡
4. **Shared Environment**: Both applications are orchestrated through a single root-level development script, allowing them to happily co-exist and communicate on a single port during local development. 🛠️

---

## 🚀 Deployment & Build Process

Deploying Iris and MDS Storybook is fully automated to give you a smooth continuous integration experience. 🏗️

### 📦 The Build Pipeline
1. **GitHub Actions 🤖**: We use GitHub Actions to automate the entire build and deployment process.
2. **Concurrent Build**: Upon pushing to the main branch, our CI pipeline builds *both* the Token Editor and the massive Storybook bundle. Memory optimizations ensure the Storybook webpack build runs flawlessly in the cloud! ☁️
3. **Integrated Output**: The Token Editor acts as the entry point, and the Storybook interface is served alongside it, allowing users to edit tokens and view component updates seamlessly.

Whenever you save your favorite configurations in the Token Editor, they are persistently formatted so your tokens look perfect every single time.

---

## 💻 Getting Started Locally

Getting the magical live-sync experience locally is super simple!

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abhiroopchaudhuri/iris-token-color-editor.git
   cd iris-token-color-editor
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(This ensures both the Token Editor and MDS Storybook dependencies are met)*

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```

Boom! 💥 You now have both the Token Editor and the MDS Storybook running concurrently. Start sliding those HSL values and watch your components transform in real-time! 🎉

---

### ❤️ Contributing
We love contributions Iris Token Editor! Feel free to open issues, submit Pull Requests, or suggest new features to make this even better.

Made with ❤️!
