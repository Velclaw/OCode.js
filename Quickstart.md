# Quickstart for repositories

Learn how to create a new repository and commit your first change in 5 minutes.

## Create a repository

GitHub repositories store a variety of projects. In this guide, you'll create a repository and commit your first change.

<div class="ghd-tool webui">

1. In the upper-right corner of any page, select <svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-plus" aria-label="Create something new" role="img"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg>, then click **New repository**.

   ![Screenshot of a GitHub dropdown menu showing options to create new items. The menu item "New repository" is outlined in dark orange.](/assets/images/help/repository/repo-create-global-nav-update.png)
2. Type a short, memorable name for your repository. For example, "hello-world".

   ![Screenshot of the first step in creating a repository. The "Repository name" field contains the text "hello-world" and is outlined in dark orange.](/assets/images/help/repository/create-repository-name.png)
3. Optionally, add a description of your repository. For example, "My first repository on GitHub."
4. Choose a repository visibility. For more information, see [About repositories](/en/repositories/creating-and-managing-repositories/about-repositories#about-repository-visibility).
5. Toggle **Add README** to **On**.
6. Click **Create repository**.

Congratulations! You've successfully created your first repository, and initialized it with a *README* file.

</div>

<div class="ghd-tool cli">

> \[!NOTE]
> To learn more about GitHub CLI, see [About GitHub CLI](/en/github-cli/github-cli/about-github-cli).

1. In the command line, navigate to the directory where you would like to create a local clone of your new project.
2. To create a repository for your project, use the `gh repo create` subcommand. When prompted, select **Create a new repository on GitHub from scratch** and enter the name of your new project. If you want your project to belong to an organization instead of to your personal account, specify the organization name and project name with `organization-name/project-name`.
3. Follow the interactive prompts. To clone the repository locally, confirm yes when asked if you would like to clone the remote project directory.
4. Alternatively, to skip the prompts supply the repository name and a visibility flag (`--public`, `--private`, or `--internal`). For example, `gh repo create project-name --public`. To clone the repository locally, pass the `--clone` flag. For more information about possible arguments, see the [GitHub CLI manual](https://cli.github.com/manual/gh_repo_create).

</div>

## Commit your first change

<div class="ghd-tool webui">

A [commit](/en/get-started/learning-about-github/github-glossary#commit) is like a snapshot of all the files in your project at a particular point in time.

When you created your new repository, you initialized it with a *README* file. *README* files are a great place to describe your project in more detail, or add some documentation such as how to install or use your project. The contents of your *README* file are automatically shown on the front page of your repository.

Let's commit a change to the README file.

1. In your repository's list of files, select **README.md**.

   ![Screenshot of a list of files in a repository. A file name, "README.md", is highlighted with an orange outline.](/assets/images/help/repository/create-commit-open-readme.png)

2. In the upper right corner of the file view, click <svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-pencil" aria-label="Edit file" role="img"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path></svg> to open the file editor.
   ![Screenshot of a file. In the header, a button, labeled with a pencil icon, is outlined in dark orange.](/assets/images/help/repository/edit-file-edit-button.png)

3. In the text box, type some information about yourself.

4. Above the new content, click **Preview**.

   ![Screenshot of a file in edit mode. Above the file's contents, a tab labeled "Preview" is outlined in dark orange.](/assets/images/help/repository/edit-readme-preview-changes.png)

5. Review the changes you made to the file. If you select **Show diff**, you will see the new content in green.

   ![Screenshot of a file preview. The "Show diff" checkbox is enabled and additions to the file are shown with a green line. Both are outlined in orange.](/assets/images/help/repository/create-commit-review.png)

6. Click **Commit changes...**

7. In the "Commit message" field, type a short, meaningful commit message that describes the change you made to the file. You can attribute the commit to more than one author in the commit message. For more information, see [Creating a commit with multiple authors or on behalf of an organization](/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors).

8. Below the commit message fields, decide whether to add your commit to the current branch or to a new branch. If your current branch is the default branch, you should choose to create a new branch for your commit and then create a pull request. For more information, see [Creating a pull request](/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request).

   ![Screenshot of a GitHub pull request showing a radio button to commit directly to the main branch or to create a new branch. New branch is selected.](/assets/images/help/repository/choose-commit-branch.png)

9. Click **Commit changes** or **Propose changes**.

</div>

<div class="ghd-tool cli">

Now that you have created a project, you can start committing changes.

*README* files are a great place to describe your project in more detail, or add some documentation such as how to install or use your project. The contents of your *README* file are automatically shown on the front page of your repository. Follow these steps to add a *README* file.

1. In the command line, navigate to the root directory of your new project. (This directory was created when you ran the `gh repo create` command.)

2. Create a *README* file with some information about the project.

   ```shell
   echo "info about this project" >> README.md
   ```

3. Enter `git status`. You will see that you have an untracked `README.md` file.

   ```shell
   $ git status

   Untracked files:
     (use "git add <file>..." to include in what will be committed)
     README.md

   nothing added to commit but untracked files present (use "git add" to track)
   ```

4. Stage and commit the file.

   ```shell
   git add README.md && git commit -m "Add README"
   ```

5. Push the changes to your branch.

   ```shell
   git push --set-upstream origin HEAD
   ```

</div>

## Next steps

You have now created a repository, including a *README* file, and created your first commit on GitHub.

<div class="ghd-tool webui">

* You can now clone a GitHub repository to create a local copy on your computer. From your local repository you can commit, and create a pull request to update the changes in the upstream repository. For more information, see [Cloning a repository](/en/repositories/creating-and-managing-repositories/cloning-a-repository) and [Set up Git](/en/get-started/git-basics/set-up-git).

</div>

* Secure your repository using GitHub's available security features. For more information, see [Quickstart for securing your repository](/en/code-security/getting-started/quickstart-for-securing-your-repository).

* You can find interesting projects and repositories on GitHub and make changes to them by creating a fork of the repository. Forking a repository will allow you to make changes to another repository without affecting the original. For more information, see [Fork a repository](/en/pull-requests/how-tos/work-with-forks/fork-a-repo).

* Each repository on GitHub is owned by a person or an organization. You can interact with the people, repositories, and organizations by connecting and following them on GitHub. For more information, see [Discovering projects on GitHub](/en/get-started/exploring-projects-on-github/discovering-projects-on-github).

* GitHub has a great support community where you can ask for help and talk to people from around the world. Join the conversation on [GitHub Community](https://github.com/orgs/community/discussions).