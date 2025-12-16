require('dotenv').config();

const LITERAL_API = "https://literal.club/graphql/";

const LOGIN_MUTATION = `
  mutation login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      profile {
        id
        handle
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
        id
        slug
        title
        subtitle
        cover
        authors {
          id
          name
        }
      }
    }
  }
`;

async function graphqlRequest(query, variables = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(LITERAL_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

async function getAuthToken(email, password) {
  const data = await graphqlRequest(LOGIN_MUTATION, { email, password });
  if (!data.login) throw new Error("Login failed");
  return { token: data.login.token, profileId: data.login.profile.id };
}

async function getReadingStates(token) {
  const data = await graphqlRequest(READING_STATES_QUERY, {}, token);
  return data.myReadingStates || [];
}

function transformBook(state) {
  const book = state.book;
  return {
    id: book.id,
    title: book.title || "Untitled",
    author: book.authors?.map((a) => a.name).join(", ") || "Unknown",
    cover: book.cover || null,
    slug: book.slug,
    date: state.createdAt,
  };
}

module.exports = async function () {
  const email = process.env.LITERAL_EMAIL;
  const password = process.env.LITERAL_PASSWORD;

  if (!email || !password) {
    console.log("No Literal credentials. Using empty data.");
    return { currentlyReading: [], wantToRead: [], finished: [] };
  }

  try {
    console.log("Fetching from Literal...");
    const { token } = await getAuthToken(email, password);
    const states = await getReadingStates(token);

    const currentlyReading = states.filter(s => s.status === "IS_READING").map(transformBook);
    const wantToRead = states.filter(s => s.status === "WANTS_TO_READ").map(transformBook);
    const finished = states.filter(s => s.status === "FINISHED").map(transformBook);

    console.log(`Found: ${currentlyReading.length} reading, ${wantToRead.length} want, ${finished.length} finished`);
    return { currentlyReading, wantToRead, finished };
  } catch (error) {
    console.error("Literal error:", error.message);
    return { currentlyReading: [], wantToRead: [], finished: [] };
  }
};
