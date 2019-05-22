[![Build Status](https://travis-ci.org/pattonw/CATMAID-autoproofreader.svg?branch=master)](https://travis-ci.org/pattonw/CATMAID-autoproofreader)
[![Coverage Status](https://coveralls.io/repos/github/pattonw/CATMAID-autoproofreader/badge.svg?branch=master)](https://coveralls.io/github/pattonw/CATMAID-autoproofreader?branch=master)

# CATMAID-autoproofreader

Autoproofreader is a django application which acts as a drop-in
extension for [CATMAID](http://www.catmaid.org). It contains API
endpoints and static files.

## Quick start

1. Install autoproofreader in whichever python environment is running
   CATMAID with `pip install -e path/to/this/directory`

2. Run `python manage.py migrate` to create the autoproofreader models.

3. Run `python manage.py collectstatic -l` to pick up
   autoproofreader's static files.

4. Add `autoproofreader` to the list of `KNOWN_EXTENSIONS` in `django/projects/mysite/pipelinefiles.py`.

## Usage

The autoproofreader widget relies on a compute server to handle the
computations involved with automatically proofreading a neuron reconstruction.
Thus the first thing you have to do is set up a compute server.

### Configuring a compute server

#### In CATMAID

When you add a new server through the admin page you will see the following fields:

1. **Name**: This is what will be displayed when listing available servers.

2. **Address**: The address used by ssh to reach this server.

3. **Diluvian path**: This field is depricated and will be removed, you can leave it empty.

4. **Results directory**: This is where all files for running jobs and gathering their
   results will be stored. After each job is done, this directory will be cleaned up so that
   storage does not become a problem.

5. **Environment source path**: It is recomended that you install the
   necessary packages `sarbor` in a virtual environment to avoid version
   requirement conflicts with other packages. The source path points to
   the `activate` script that creates your virtual environment. For example
   `~/.virtualenvs/autoproofreader/bin/activate`.

6. **Project whitelist**: These are the projects from which this server
   is accessable. If you leave this field blank, all projects will have
   access to running jobs on this server.

7. **ssh user**: All jobs will be submitted through the back end under
   one user. This user will have to be added to the server and given permission
   to read and write from the `Results directory`, as well as have access
   to the `environment_source_path`.

8. **ssh key**: The `ssh_user` needs to be set up with a private/public
   key pair to securely access the server. You can read more about how to
   do this at https://www.ssh.com/ssh/keygen/. Once this is done, move
   the private key to `django/projects/mysite/.ssh/`. Whatever you name the
   private key file is what goes in this field. When connecting to the server
   the backend will look for a file called **ssh key** in `django/projects/mysite/.ssh/`.

#### On The Server

1. Make sure there is a user called **ssh user** who has a public/private key
   pair configured for this server, with the private key stored in the appropriate
   location.
2. Create a virtual environment and pip install sarbor from https://github.com/pattonw/sarbor.
3. Make `diluvian` or the `cached lsd` segmentation sources available.

##### Diluvian

1. pip install `diluvian` into your virtual environment from https://github.com/pattonw/diluvian.

##### Cached lsd

1. create a `sensitives.json` file. This file will be used to retrieve
   segmentations from a mongodb.

The `sensitives.json` file should look something like this:

```javascript
{
    "frag_db_host": "0.0.0.0",
    "frag_db_name": "example_db_name",
    "edges_collection": "example_edge_collection",
    "fragments_file": "/absolute/path/to/fragments/zarr.zarr",
    "fragments_dataset": "/zarr/dataset/path",
}
```

### Running a Job

Once you have a server set up to accept proofreading jobs, you can submit a job
by openning up the autoproofreading widget in catmaid. In the `Run` tab, you
can fill out the settings that you want.

The `run settings` section contains basic job information such as a name,
which server to use, which skeleton to proofread, and what source the backend
should use to obtain segmentations. If you choose a _cached lsd_ job, you
need only provide the path to the `sensitives.json` file for the mongodb you want to use.
If you choose a _diluvian_ job, you will also need to configure a diluvian model
and an image volume, since it needs the raw data and the model weights to
compute your segmentations, rather than just retrieving it from a database.

The `sarbor settings` section contains configuration for the sarbor package
which does all of the computations for finding potential errors and ranking them.
Here you can configure things specific to the skeleton, whether you want to
downsample the skeleton and by how much, whether you want to smooth the skeleton.
You can also specify segmentation specific fields such as the amount of downsampling
you want to use and how large a field of view around each sample point you would like
to use.

Once you are satisfied with the settings, you can click Download settings to
store a copy of them to reuse later. Clicking upload settings with the file that
you downloaded will then repopulate all the fields with the settings you have
provided.
Finally clicking Segment will start the job which you will be able to see in
the Queued job table. Here you will see some basic information about your
job while you wait for it to complete.

Once a job is complete you can see it in the completed jobs table. Here
you can see the completed jobs and clicking on a name will select it for you.
Once selected you can move to the rankings table to view your results.
The two checkmarks at the top will toggle the proofread skeleton and the
segmentations. clicking either a branch score or a connectivity score will
move your field of view to the appropriate location and display the information
you asked for. 

If you clicked on a branch score and you have the proofread skeleton
layer active, you should see a black and white virtual node pointing to the location
of the expected missing branch. If you also display the segmentations you
can gain some insight as to why that point was chosen. Generally it is a
point that is confidently segmented, and most distant to all current sample points.

Clicking on the connectivity score will hide the whole proofread skeleton, except the
edge between the two nodes that you are interested in.

After reviewing a node you can mark it as reviewed for future reference.