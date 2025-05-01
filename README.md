# eliza.how

Chat with an Eliza agent about your docs

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/elizaos/eliza.how.git
    cd eliza.how
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root of the project and add the following variables. Customize them according to your setup:

    ```env
    # Frontend URL
    NEXT_PUBLIC_APP_URL=http://localhost:4000

    # Eliza Agent and World IDs (replace with your specific IDs)
    NEXT_PUBLIC_AGENT_ID=2ed1ddb3-67d2-09c9-9eed-c7791ee7bb54
    NEXT_PUBLIC_WORLD_ID=00000000-0000-0000-0000-000000000000 # Usually the default world ID

    # Eliza Server URL (where your elizaos instance is running)
    NEXT_PUBLIC_SERVER_URL=http://localhost:3000

    # Repository details for context (optional, if needed by your agent)
    REPO_DIR_NAME=elizaos
    REPO_URL=https://github.com/elizaos/eliza.git
    REPO_BRANCH=v2-develop

    # API Keys (required for elizaos backend)
    # Add these to the .env file for your elizaos instance, not necessarily this frontend's .env
    # You can use just OpenAI, but Groq is *really* fast -- however we need OpenAI for the embeddings
    GROQ_API_KEY=your_anthropic_api_key
    OPENAI_API_KEY=your_openai_api_key
    ```

4.  **Configure Eliza OS:**
    Ensure your [Eliza OS](https://github.com/elizaos/eliza) instance is running and configured. You will need to provide the `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in its environment configuration (`.env` file for elizaos).

5.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

    Open [http://localhost:4000](http://localhost:4000) (or your `NEXT_PUBLIC_APP_URL`) with your browser to see the result.

## Description

This application allows users to interact with an Eliza agent, specifically configured to answer questions based on the documentation or codebase specified during the agent's setup in Eliza OS.