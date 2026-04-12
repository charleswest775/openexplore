# Contributing to OpenExplore

Thank you for your interest in contributing! This document provides guidelines
for contributing to OpenExplore.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/openexplore.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Set up your dev environment (see below)
5. Make your changes
6. Test thoroughly
7. Commit with a descriptive message (see Commit Convention below)
8. Push and open a Pull Request

## Development Setup

```bash
# Clone and enter project
git clone https://github.com/YOUR_USERNAME/openexplore.git
cd openexplore

# Create virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt   # linting, testing tools

# Run the development server
python run.py
```

Then open `http://localhost:5000` in your browser.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Formatting, no code change
- `refactor:` — Code restructuring, no feature change
- `test:` — Adding or updating tests
- `chore:` — Build, CI, dependency updates

Examples:
- `feat: add timeline view for cross-database analysis`
- `fix: handle Core Data epoch timestamps in Photos.sqlite`
- `docs: add encrypted backup setup instructions`
- `refactor: extract plist serialization into shared utility`

## Branch Naming

- `feature/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation
- `refactor/description` — Code improvements

## Pull Requests

- Keep PRs focused on a single concern
- Include a clear description of what and why
- Reference any related issues
- Ensure all tests pass before submitting
- Run `ruff check` to verify code style

## Code Style

- **Python**: Follow PEP 8, use type hints, docstrings on public functions
- **JavaScript**: Vanilla JS, no frameworks; use `const`/`let`, template literals
- **CSS**: CSS custom properties for theming, BEM-like naming
- **General**: Descriptive variable names, comments for "why" not "what"

## Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=openexplore --cov-report=term-missing

# Lint check
ruff check openexplore/
```

## Reporting Issues

Use GitHub Issues with these labels:
- `bug` — Something isn't working
- `enhancement` — Feature request
- `good first issue` — Good for newcomers
- `help wanted` — Extra attention needed

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md)
for responsible disclosure guidelines. Do **not** open a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
