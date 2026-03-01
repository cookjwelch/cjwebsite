require('dotenv').config();

const LITERAL_API = "https://api.literal.club/";

const BOOK_PARTS_FRAGMENT = `
  fragment BookParts on Book {
    id
    slug
    title
    subtitle
    description
    isbn10
    isbn13
    language
    pageCount
    publishedDate
    publisher
    cover
    authors {
      id
      name
    }
    gradientColors
  }
`;

const LOGIN_MUTATION = `
  mutation login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      profile {
        id
        handle
        name
      }
    }
  }
`;

const READING_STATES_QUERY = `
  query myReadingStates {
    myReadingStates {
      id
      status
      bookId
      profileId
      createdAt
      book {
        ...BookParts
      }
    }
  }
  ${BOOK_PARTS_FRAGMENT}
`;

async function literalRequest(query, variables = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(LITERAL_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Literal API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Literal GraphQL error: ${json.errors.map(e => e.message).join(", ")}`);
  }

  return json.data;
}

async function login(email, password) {
  const data = await literalRequest(LOGIN_MUTATION, { email, password });
  return data.login.token;
}

function transformBook(readingState) {
  const book = readingState.book || {};
  const author = (book.authors || []).map(a => a.name).join(", ") || "Unknown";
  const cover = book.cover ? book.cover.replace("http://", "https://") : null;

  return {
    id: book.id,
    title: book.title || "Untitled",
    author,
    cover,
  };
}

module.exports = async function () {
  const email = process.env.LITERAL_EMAIL;
  const password = process.env.LITERAL_PASSWORD;

  if (!email || !password) {
    console.log("No LITERAL_EMAIL/LITERAL_PASSWORD set. Using empty data.");
    return { currentlyReading: [], wantToRead: [], finished: [] };
  }

  try {
    console.log("Logging in to Literal.club...");
    const token = await login(email, password);
    console.log("Fetching reading states from Literal.club...");

    const data = await literalRequest(READING_STATES_QUERY, {}, token);
    const states = data.myReadingStates || [];

    const currentlyReading = states
      .filter(s => s.status === "IS_READING")
      .map(transformBook);

    const wantToRead = states
      .filter(s => s.status === "WANTS_TO_READ")
      .map(transformBook);

    const finished = states
      .filter(s => s.status === "FINISHED")
      .map(transformBook);

    console.log(`Found: ${currentlyReading.length} reading, ${wantToRead.length} want, ${finished.length} finished`);
    return { currentlyReading, wantToRead, finished };
  } catch (error) {
    console.error("Literal.club error:", error.message);
    return { currentlyReading: [], wantToRead: [], finished: [] };
  }
};
