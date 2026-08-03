# 📐 Architecture Documentation Guide

## 📖 Reading Order

Start here and follow this order based on what you need:

### 🚀 Getting Started (Start Here!)

1. **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** ⭐ **START HERE**
   - Complete overview of the project setup
   - What's been configured and why
   - Quick links to everything
   - **Read first**: 10 minutes

2. **[XFLOW_SDK_GUIDE.md](./XFLOW_SDK_GUIDE.md)** ⭐ **ESSENTIAL FOR API**
   - Complete XFlow SDK documentation
   - How to use PowerFlowApp
   - Upload, solve, and manage sessions
   - **Read to use the backend API**: 15 minutes

3. **[QUICK_START.md](./QUICK_START.md)** ⭐ **ESSENTIAL**
   - Step-by-step guide to create features
   - Code examples you can copy
   - Common patterns and best practices
   - **Read before coding**: 15 minutes

### 🏗️ Understanding the Architecture

3. **[ARCHITECTURE_VISUAL.md](./ARCHITECTURE_VISUAL.md)** 📊 **Visual Learners**
   - Folder structure diagrams
   - Data flow charts
   - Component hierarchy trees
   - Quick visual reference
   - **Read for visual understanding**: 10 minutes

4. **[ARCHITECTURE.md](./ARCHITECTURE.md)** 📚 **Deep Dive**
   - Detailed architecture explanation
   - Design principles and rationale
   - Best practices and patterns
   - Performance considerations
   - **Read for deep understanding**: 30 minutes

5. **[ARCHITECTURE_EXAMPLE.md](./ARCHITECTURE_EXAMPLE.md)** 💡 **Complete Example**
   - Full PowerFlow feature example
   - All layers implemented (types → services → hooks → components)
   - Shows how everything connects
   - **Read to see it all together**: 20 minutes

### 🚢 Deployment & Server

6. **[SERVER_SETUP.md](./SERVER_SETUP.md)** 🖥️ **Deployment**
   - EJS server setup and configuration
   - Environment variables
   - Docker deployment examples
   - Production setup
   - **Read before deploying**: 15 minutes

7. **[SETUP_SUMMARY.md](./SETUP_SUMMARY.md)** ⚡ **Quick Reference**
   - EJS setup summary
   - Quick commands
   - Verification checklist
   - **Read for quick reference**: 5 minutes

## 🎯 Choose Your Path

### Path 1: "I want to start coding NOW"
```
1. PROJECT_OVERVIEW.md (quick skim)
2. QUICK_START.md (read carefully)
3. Start building!
4. Refer back as needed
```

### Path 2: "I want to understand everything first"
```
1. PROJECT_OVERVIEW.md
2. ARCHITECTURE_VISUAL.md
3. ARCHITECTURE.md
4. ARCHITECTURE_EXAMPLE.md
5. QUICK_START.md
6. Start building!
```

### Path 3: "I need to deploy this"
```
1. PROJECT_OVERVIEW.md
2. SERVER_SETUP.md
3. SETUP_SUMMARY.md
```

### Path 4: "Show me an example"
```
1. ARCHITECTURE_EXAMPLE.md
2. Check src/components/common/Button/
3. QUICK_START.md
4. Start building!
```

## 📂 Additional Documentation

### In Source Code
- **`src/features/README.md`** - Guidelines for creating features
- **`src/components/common/README.md`** - Guidelines for common components
- **Example Component**: `src/components/common/Button/` - Reference implementation

### Project Root
- **`README.md`** - Project readme (original)
- **`README_I18N.md`** - Internationalization guide (existing)
- **`I18N_*.md`** - i18n documentation (existing)

## 🎓 Learning Checklist

- [ ] Read PROJECT_OVERVIEW.md
- [ ] Read QUICK_START.md
- [ ] Review Button component example
- [ ] Understand path aliases (`@/components/*`, etc.)
- [ ] Learn feature structure (components, hooks, services, types)
- [ ] Read ARCHITECTURE_EXAMPLE.md
- [ ] Create your first feature
- [ ] Understand EJS server setup (SERVER_SETUP.md)

## 🔍 Quick Reference

### Where Does Code Go?

| What | Where |
|------|-------|
| Generic reusable component | `src/components/common/` |
| Feature-specific component | `src/features/FeatureName/components/` |
| Global custom hook | `src/hooks/` |
| Feature-specific hook | `src/features/FeatureName/hooks/` |
| API calls | `src/features/FeatureName/services/` |
| Types | `src/features/FeatureName/types/` or `src/types/` |
| Utilities | `src/utils/` or `src/features/FeatureName/utils/` |
| Configuration | `src/config/` |

### Common Commands

```bash
# Development
npm start                    # Dev server (hot reload)

# Production
npm run build               # Build for production
npm run serve               # Serve with EJS

# With custom API URL
API_BASE_URL=http://api.example.com:8080 npm run serve

# Testing
npm test                    # Run tests
```

### Path Aliases

```typescript
import { Button } from '@/components/common/Button';
import { MyFeature } from '@/features/MyFeature';
import { useCustomHook } from '@/hooks/useCustomHook';
import { API_BASE_URL } from '@/config/api';
import { formatDate } from '@/utils/formatters';
import type { MyType } from '@/types/common.types';
```

## 🆘 Need Help?

1. **Check the relevant documentation** using the guide above
2. **Look at example code**:
   - Button component: `src/components/common/Button/`
   - PowerFlow example: `ARCHITECTURE_EXAMPLE.md`
3. **Review the patterns** in QUICK_START.md
4. **Understand the why** in ARCHITECTURE.md

## 📊 Documentation Map

```
PROJECT_OVERVIEW.md ─────┬───── "Start here - what's this all about?"
                         │
                         ├───── QUICK_START.md ───── "How do I build features?"
                         │
                         ├───── ARCHITECTURE_VISUAL.md ───── "Show me diagrams!"
                         │
                         ├───── ARCHITECTURE.md ───── "Why is it designed this way?"
                         │
                         ├───── ARCHITECTURE_EXAMPLE.md ───── "Show me complete example"
                         │
                         └───── SERVER_SETUP.md ───── "How do I deploy?"
```

## ✨ Key Takeaways

1. **Feature-based architecture** - Organize by feature, not file type
2. **Component composition** - Build complex UIs from simple pieces
3. **Custom hooks** - Extract logic from components
4. **Path aliases** - Clean imports
5. **TypeScript** - Type safety everywhere
6. **Runtime config** - API_BASE_URL injected by server
7. **Scalable** - From 10 to 1000+ components

## 🎯 Your Next Action

**👉 Open [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) and start reading!**

Then follow the learning path that matches your needs above.

---

**Built for scale. Ready for production. Let's build something amazing! 🚀**