# Testing

## Running Tests

```bash
cd frontend

# Run tests in watch mode (re-runs on file changes)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage report
npm run test:coverage
```

## Stack

- **Vitest** — test runner, compatible with Vite's transform pipeline
- **@testing-library/react** — render components and query the DOM
- **@testing-library/user-event** — simulate realistic user interactions
- **@testing-library/jest-dom** — custom matchers like `toBeInTheDocument()`
- **jsdom** — browser environment simulation

## Conventions

- Test files live next to the code they test, inside a `__tests__/` folder
- File naming: `ComponentName.test.tsx` or `utils.test.ts`
- Use `describe` blocks to group tests by component/module
- Use clear test descriptions in Portuguese or English (match the team preference)
- Mock external dependencies (API calls, Three.js components, contexts)
- Prefer querying by role, placeholder, or text over test IDs

## File Structure

```
src/
├── pages/
│   └── auth/
│       ├── Login.tsx
│       └── __tests__/
│           └── Login.test.tsx
├── components/
│   └── shared/
│       └── __tests__/
│           └── Button.test.tsx   (example)
└── test/
    └── setup.ts                  (global test setup)
```

## How to Add a New Test

1. Create a `__tests__/` folder next to the component if it doesn't exist
2. Create a file named `YourComponent.test.tsx`
3. Import testing utilities and the component:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { YourComponent } from '../YourComponent'
```

4. Mock any dependencies that are heavy or external:

```tsx
// Mock a context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
  }),
}))

// Mock a heavy component (e.g., Three.js)
vi.mock('@/components/shared/ModelViewer', () => ({
  ModelViewer: () => <div data-testid="model-viewer" />,
}))
```

5. Write your tests:

```tsx
describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />)
    expect(screen.getByText('Expected text')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    const user = userEvent.setup()
    render(<YourComponent />)

    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(screen.getByText('Result')).toBeInTheDocument()
  })
})
```

## Tips

- Wrap components that use `react-router-dom` hooks in `<MemoryRouter>`
- Use `waitFor` for assertions on async state changes
- Use `vi.fn()` to create mock functions and assert on calls
- Use `vi.clearAllMocks()` in `beforeEach` to reset state between tests
- Mock Three.js components to avoid WebGL errors in jsdom
